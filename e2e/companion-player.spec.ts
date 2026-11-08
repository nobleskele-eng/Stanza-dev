import { readdirSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { fixtures } from "../dev/fixtures/nowPlaying";
import type { SpotifyState, SpotifyVolume } from "../src/adapters/spotifyFeed";
import { artPixelPx, spriteBoxPx } from "../src/companion/pixel";
import { CONTRACT_VERSION } from "../src/theme/variant";

// The companion in the production player (PLAN.md §4b, M2 C2b; THEME_CONTRACT.md "Companion (v7)"). The production
// bundle in a fake Tauri, like production.spec.ts: what the bundle asks of the native window is checked here, whether
// Tauri then does it is checked by hand in the real exe (DECISIONS.md).
test.use({ baseURL: "http://localhost:4173" });
// Every test builds its own page, so the long time-lapses can spread across workers instead of queueing in one.
test.describe.configure({ mode: "parallel" });

// Written out, like production.spec.ts: changing the key would discard every saved appearance.
const APPEARANCE_STORAGE_KEY = "mp.appearance.v1";
const THEME_IDS = ["t1-default", "t2-artwork", "t3-pill", "t4-extreme", "t5-kinetic"]; // registry order
const SKIN_IDS = readdirSync(new URL("../companions/", import.meta.url)).filter((id) => !id.startsWith("."));
const skinJson = (id: string) =>
  JSON.parse(readFileSync(new URL(`../companions/${id}/companion.json`, import.meta.url), "utf8")) as {
    grid: number;
    anchor: { y: number };
    palettes: Record<string, string[]>;
    animations: Record<string, { anchor?: { y: number } }>;
    accessories?: Record<string, { colours: string[] }>;
  };
const skinGrid = (id: string) => skinJson(id).grid;
/** The art row a pose rests on its surface by (the animation's anchor, else the skin's). */
const anchorRow = (id: string, state: string) => {
  const skin = skinJson(id);
  return (skin.animations[state]?.anchor ?? skin.anchor).y;
};
const themeJson = (id: string) =>
  JSON.parse(readFileSync(new URL(`../themes/${id}/theme.json`, import.meta.url), "utf8")) as {
    window: { width: number; height: number };
    layout: string;
  };
/** The parts the pet must never cover (the same list CompanionLayer.tsx measures, written out). */
const PART_SELECTOR = [
  ".mp-artwork", ".mp-meta", ".mp-progress", ".mp-time-current", ".mp-time-total", ".mp-controls",
  ".mp-volume-wrap", ".mp-link-out", ".mp-source-badge", ".mp-empty", ".mp-error",
].join(", ");
const PET_STATES = ["idle", "walk", "sit", "sleep", "wake", "react", "climb", "hang", "held", "fall", "land", "over", "under"]; // contract v11, C3c
const PET_SURFACES = ["top", "right", "bottom", "left", "shelf", "air"]; // contract v10, C5b
// Where the fake says the window is (physical px, scale 1), so a move reads as a plain offset from it.
const AT = { x: 100, y: 300 };

const TYPICAL = fixtures["typical / all caps"].track!;
const ARTWORK = fixtures["colorful artwork (filter test)"].track!.artwork!;
const spotifyState = (at: number, over: Partial<SpotifyState> = {}): SpotifyState => ({
  seq: 3,
  session: true,
  status: "playing",
  title: TYPICAL.title,
  artist: TYPICAL.artist,
  album: TYPICAL.album!,
  artworkId: 1,
  artwork: ARTWORK,
  positionMs: 42_000,
  durationMs: TYPICAL.durationMs!,
  positionUpdatedAt: at,
  canSeek: true,
  ...over,
});

type IpcCall = { cmd: string; args: Record<string, unknown> };

/**
 * A smaller fake than production.spec.ts's: IPC log, Spotify's state and its own volume (none by default), native
 * menus, and the window's position.
 */
async function fakeTauri(page: Page, spotify: SpotifyState, volume: SpotifyVolume | null = null) {
  await page.addInitScript(
    ({ spotify, volume, at }) => {
      const calls: IpcCall[] = [];
      const callbacks = new Map<number, (raw: unknown) => void>();
      let nextCallback = 1;
      let nextRid = 100;
      let nextImageRid = 500;
      let closeOpenMenu: (() => void) | null = null;
      Object.assign(window, {
        isTauri: true,
        __ipcCalls: calls,
        // Deliver an app event to every listener of it, the way Rust's `emit` does.
        __emit: (event: string, payload: unknown) => {
          for (const c of calls) {
            const a = c.args as { event?: string; handler?: number };
            if (c.cmd === "plugin:event|listen" && a.event === event) callbacks.get(a.handler!)?.({ event, id: 1, payload });
          }
        },
        __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
        __fireChannel: (channel: string, message: unknown) =>
          callbacks.get(Number(channel.replace("__CHANNEL__:", "")))?.({ index: 0, message }),
        __closeMenu: () => {
          const close = closeOpenMenu;
          closeOpenMenu = null;
          close?.();
        },
        __TAURI_INTERNALS__: {
          metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
          invoke: (cmd: string, args: unknown) => {
            calls.push({ cmd, args: JSON.parse(JSON.stringify(args ?? {})) });
            if (cmd === "plugin:menu|new") return Promise.resolve([nextRid, `menu-${nextRid++}`]);
            if (cmd === "plugin:image|new") return Promise.resolve(nextImageRid++);
            if (cmd === "plugin:menu|popup") return new Promise((resolve) => (closeOpenMenu = () => resolve(null)));
            if (cmd === "plugin:window|outer_position") return Promise.resolve(at);
            if (cmd === "plugin:window|scale_factor") return Promise.resolve(1);
            if (cmd === "spotify_state") return Promise.resolve(spotify);
            if (cmd === "spotify_volume") return Promise.resolve(volume);
            if (cmd.startsWith("spotify_")) return Promise.resolve(null);
            return Promise.resolve(null);
          },
          transformCallback: (cb: (raw: unknown) => void) => {
            callbacks.set(nextCallback, cb);
            return nextCallback++;
          },
          unregisterCallback: (id: number) => callbacks.delete(id),
        },
      });
    },
    { spotify, volume, at: AT },
  );
}

// The shipped content security policy (Slice 5): Tauri sends tauri.conf.json's CSP as a header in release builds, so
// the gate serves the bundle with it, as production.spec.ts does, and fails on anything it blocks.
const CSP = (JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8")) as { app: { security: { csp: string } } }).app
  .security.csp;
/** Serves the bundle with the shipped CSP header and collects what goes wrong: CSP violations, page and console errors. */
async function watchForProblems(page: Page) {
  await page.route(
    (url) => url.pathname === "/" || url.pathname.endsWith(".html"),
    async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": CSP } });
    },
  );
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { __cspViolations: seen });
    window.addEventListener("securitypolicyviolation", (e) => seen.push(`CSP: ${e.violatedDirective} ${e.blockedURI}`), true);
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  return async () => [...errors, ...(await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations))];
}

const ipcCalls = (page: Page, cmd: string) =>
  page.evaluate((c) => (window as unknown as { __ipcCalls: IpcCall[] }).__ipcCalls.filter((x) => x.cmd === c), cmd);
const emitSpotify = (page: Page, state: SpotifyState) =>
  page.evaluate((s) => (window as unknown as { __emit: (e: string, p: unknown) => void }).__emit("spotify:state", s), state);
const saveAppearance = (page: Page, theme: string, companion: object) =>
  page.addInitScript(
    ([key, theme, layout, contract, companion]) =>
      localStorage.setItem(
        key as string,
        JSON.stringify({ theme, variant: { theme, contract, layout, overrides: {}, hidden: [] }, companion }),
      ),
    [APPEARANCE_STORAGE_KEY, theme, themeJson(theme).layout, CONTRACT_VERSION, companion] as const,
  );

type MenuItemArg = { text?: string; checked?: boolean; icon?: number; handler?: string; item?: string; items?: MenuItemArg[] };
/** Right-clicks the card and returns the menu's items as the app sent them; the menu stays open. */
async function openMenu(page: Page) {
  const before = (await ipcCalls(page, "plugin:menu|popup")).length;
  const box = (await page.locator(".mp-window").boundingBox())!;
  await page.mouse.click(box.x + 20, box.y + 20, { button: "right" });
  await expect.poll(async () => (await ipcCalls(page, "plugin:menu|popup")).length).toBe(before + 1);
  return ((await ipcCalls(page, "plugin:menu|new")).at(-1)!.args.options as { items: MenuItemArg[] }).items;
}
/** Picks a menu item (its channel fires, as the native menu's click would), then closes the menu. */
async function fireAndClose(page: Page, item: MenuItemArg) {
  await page.evaluate((h) => (window as unknown as { __fireChannel: (c: string, m: unknown) => void }).__fireChannel(h, "item"), item.handler!);
  await page.evaluate(() => (window as unknown as { __closeMenu: () => void }).__closeMenu());
}
/**
 * The companion's items, after the themes: a separator, the on/off cassette, then the picker (C6a). The picker is a
 * submenu made first as its own resource, its picture set on it with `set_icon` (an inline submenu with an icon is
 * read as a plain icon item by Tauri: DECISIONS.md C6a); here it's put back together as one item.
 */
async function companionItems(page: Page, items: MenuItemArg[]) {
  const [separator, toggle, ref] = items.slice(THEME_IDS.length) as [MenuItemArg, MenuItemArg, unknown];
  expect(separator).toEqual({ item: "Separator" });
  expect(items).toHaveLength(THEME_IDS.length + 3);
  expect(ref, "the picker, an existing submenu").toEqual([expect.any(Number), "Submenu"]);
  const rid = (ref as [number, string])[0];
  const made = (await ipcCalls(page, "plugin:menu|new")).filter((c) => c.args.kind === "Submenu").at(-1)!;
  const icon = (await ipcCalls(page, "plugin:menu|set_icon")).filter((c) => c.args.rid === rid).at(-1)?.args.icon as number | undefined;
  return { toggle, picker: { ...(made.args.options as MenuItemArg), icon } };
}
/** The picture behind an image resource id: the fake hands them out in order from 500. */
const imageOf = async (page: Page, rid: number) =>
  (await ipcCalls(page, "plugin:image|new"))[rid - 500].args as { rgba: number[]; width: number; height: number };
/** Right-click the card, then fire the companion's on/off item and close the menu. */
async function toggleFromMenu(page: Page) {
  const { toggle } = await companionItems(page, await openMenu(page));
  await fireAndClose(page, toggle);
  return toggle;
}

const last = <T>(xs: T[]) => xs[xs.length - 1];

test("off by default: no companion part exists, the window is the theme's size and never moves", async ({ page }) => {
  await fakeTauri(page, spotifyState(Date.now()));
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-status", "playing");
  await expect(page.locator(".mp-companion-layer, .mp-companion")).toHaveCount(0);
  const { width, height } = themeJson("t1-default").window;
  await expect.poll(async () => last(await ipcCalls(page, "plugin:window|set_size"))?.args.value).toEqual({ Logical: { width, height } });
  expect(await ipcCalls(page, "plugin:window|set_position")).toEqual([]);
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), APPEARANCE_STORAGE_KEY);
  expect(stored.companion).toMatchObject({ on: false, skin: "pilcrow" });
});

/** Gives the page the size the app last asked of the native window, as Tauri would (logical px = CSS px here). */
async function applyWindowSize(page: Page) {
  const { width, height } = (last(await ipcCalls(page, "plugin:window|set_size")).args.value as { Logical: { width: number; height: number } }).Logical;
  await page.setViewportSize({ width, height });
}

test("the menu turns it on and off: the parts come and go, the window grows by the pet's box on every side and back, the card stays put on screen, and it's saved", async ({ page }) => {
  await fakeTauri(page, spotifyState(Date.now()));
  const { width, height } = themeJson("t1-default").window;
  await page.setViewportSize({ width, height });
  await page.goto("/");
  const card = page.locator(".mp-window");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-status", "playing");
  const { x: x0, y: y0 } = (await card.boundingBox())!;

  // On.
  const off = await toggleFromMenu(page);
  // An icon with no text (docs/DECISIONS.md 2026-10-22): the first image made is the asleep cassette, since it was off.
  expect(off).toEqual({ text: "", icon: 500, handler: expect.any(String) });
  await expect(page.locator(".mp-companion")).toHaveCount(1);
  const margin = await page.locator(".app-stage").evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
  expect(margin).toBeGreaterThan(0);
  expect(margin % 4, "the margin is a sprite box, a multiple of the 4 px layout grid").toBe(0);
  const pads = await page.locator(".app-stage").evaluate((el) => {
    const s = getComputedStyle(el);
    return [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(parseFloat);
  });
  expect(pads, "the same margin on every side").toEqual([margin, margin, margin, margin]);
  await expect
    .poll(async () => last(await ipcCalls(page, "plugin:window|set_size")).args.value)
    .toEqual({ Logical: { width: width + 2 * margin, height: height + 2 * margin } });
  await expect.poll(async () => last(await ipcCalls(page, "plugin:window|set_position"))?.args.value).toEqual({ Logical: { x: AT.x - margin, y: AT.y - margin } });
  // The window moved left and up by the margin and the card moved right and down inside it by the same: on screen it
  // didn't move.
  await applyWindowSize(page);
  await expect.poll(async () => (await card.boundingBox())!.x).toBeCloseTo(x0 + margin, 5);
  expect((await card.boundingBox())!.y).toBeCloseTo(y0 + margin, 5);
  let stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), APPEARANCE_STORAGE_KEY);
  expect(stored.companion).toMatchObject({ on: true });

  // Off again: the item shows the awake cassette now (another picture, made for this menu); everything goes back.
  const on = await toggleFromMenu(page);
  expect(on).toMatchObject({ text: "", icon: expect.any(Number) });
  expect(on.icon).not.toBe(off.icon);
  expect((await imageOf(page, on.icon!)).rgba).not.toEqual((await imageOf(page, off.icon!)).rgba);
  expect(on).not.toHaveProperty("checked");
  await expect(page.locator(".mp-companion-layer, .mp-companion")).toHaveCount(0);
  await expect.poll(async () => last(await ipcCalls(page, "plugin:window|set_size")).args.value).toEqual({ Logical: { width, height } });
  await expect.poll(async () => last(await ipcCalls(page, "plugin:window|set_position")).args.value).toEqual({ Logical: { x: AT.x + margin, y: AT.y + margin } });
  await applyWindowSize(page);
  await expect.poll(async () => (await card.boundingBox())!.x).toBeCloseTo(x0, 5);
  expect((await card.boundingBox())!.y).toBeCloseTo(y0, 5);
  stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), APPEARANCE_STORAGE_KEY);
  expect(stored.companion).toMatchObject({ on: false });
});

test("the picker (C6a, D2c): pictures only, every species, the current one's palettes and what it can wear; a pick turns it on as that creature, saved, and the next menu shows it awake", async ({ page }) => {
  await saveAppearance(page, "t1-default", { on: false, skin: "pilcrow", palette: "default" });
  await fakeTauri(page, spotifyState(Date.now()));
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-status", "playing");
  /**
   * The picker's items as [the label picture, species ×3, `skin`'s palettes, bare + its accessories], checking its
   * shape: pictures, no text.
   */
  const pickerOf = async (skin: string) => {
    const { picker } = await companionItems(page, await openMenu(page));
    const items = picker.items!;
    expect(picker.text, "the submenu has no text").toBe("");
    const palettes = Object.keys(skinJson(skin).palettes).length;
    const wears = 1 + Object.keys(skinJson(skin).accessories!).length;
    const pictures = (n: number) => Array(n).fill("picture");
    expect(items.map((i) => i.item ?? "picture")).toEqual([...pictures(3), "Separator", ...pictures(palettes), "Separator", ...pictures(wears)]);
    for (const i of items.filter((i) => !i.item)) expect(i, "a picture, no text, no check").toEqual({ text: "", icon: expect.any(Number), handler: expect.any(String) });
    return { label: picker.icon!, species: items.slice(0, 3), palettes: items.slice(4, 4 + palettes), accessories: items.slice(5 + palettes) };
  };
  /** The colours the pet is drawn in now, and the first colour of what it wears ("" for nothing). */
  const colours = () => page.locator(".mp-companion svg").evaluate((el) => (el as SVGElement).style.getPropertyValue("--mp-pet-1").trim());
  const worn = () => page.locator(".mp-companion svg").evaluate((el) => (el as SVGElement).style.getPropertyValue("--mp-acc-1").trim());
  const stored = async () => (await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), APPEARANCE_STORAGE_KEY)).companion;

  // Off, pilcrow in its default palette, bare: the current species, palette and accessory are the label's own picture
  // (awake); every other picture differs from it and from each other.
  let p = await pickerOf("pilcrow");
  expect(p.species[0].icon).toBe(p.label);
  expect(p.palettes[0].icon).toBe(p.label);
  expect(p.accessories[0].icon, "bare").toBe(p.label);
  const others = [...p.species.slice(1), ...p.palettes.slice(1), ...p.accessories.slice(1)].map((i) => i.icon);
  expect(new Set([p.label, ...others]).size).toBe(1 + others.length);
  await expect(page.locator(".mp-companion")).toHaveCount(0);

  // The bookworm: on, as a bookworm in its default palette, saved.
  await fireAndClose(page, p.species[1]);
  await expect(page.locator(".mp-companion")).toHaveCount(1);
  await expect.poll(colours).toBe(skinJson("bookworm").palettes.default[0]);
  expect(await stored()).toEqual({ on: true, skin: "bookworm", palette: "default", accessory: null });

  // The next menu: the bookworm awake, and its palettes now. Its third palette: recoloured, saved.
  p = await pickerOf("bookworm");
  expect(p.species[1].icon).toBe(p.label);
  expect(p.palettes[0].icon).toBe(p.label);
  expect(p.species[0].icon, "pilcrow asleep now").not.toBe(p.label);
  const third = Object.keys(skinJson("bookworm").palettes)[2];
  await fireAndClose(page, p.palettes[2]);
  await expect.poll(colours).toBe(skinJson("bookworm").palettes[third][0]);
  expect(await stored()).toEqual({ on: true, skin: "bookworm", palette: third, accessory: null });
  p = await pickerOf("bookworm");
  expect(p.palettes[2].icon).toBe(p.label);
  expect(p.species[1].icon, "the bookworm's own picture is in its new palette").toBe(p.label);
  expect(await worn(), "wearing nothing").toBe("");

  // What it wears (D2c), the row after the palettes: [bare, headphones, beanie, scarf, bow]. The headphones: drawn in
  // their colours, saved, and awake in the next menu, where every picture of the bookworm wears them.
  expect(Object.keys(skinJson("bookworm").accessories!)[0]).toBe("headphones");
  await fireAndClose(page, p.accessories[1]);
  await expect.poll(worn).toBe(skinJson("bookworm").accessories!.headphones.colours[0]);
  await expect(page.locator(".mp-companion svg path.mp-pet-a1")).toHaveCount(1);
  expect(await colours(), "still in its palette").toBe(skinJson("bookworm").palettes[third][0]);
  expect(await stored()).toEqual({ on: true, skin: "bookworm", palette: third, accessory: "headphones" });
  p = await pickerOf("bookworm");
  expect(p.accessories[1].icon).toBe(p.label);
  expect(p.palettes[2].icon, "its palette picture wears them").toBe(p.label);
  expect(p.species[1].icon, "and its species picture").toBe(p.label);
  expect(p.accessories[0].icon, "bare is another picture now").not.toBe(p.label);

  // Another species keeps them: the cassette, in its own headphones.
  await fireAndClose(page, p.species[2]);
  await expect.poll(worn).toBe(skinJson("cassette").accessories!.headphones.colours[0]);
  expect(await stored()).toEqual({ on: true, skin: "cassette", palette: "default", accessory: "headphones" });
  // Bare takes them off.
  p = await pickerOf("cassette");
  expect(p.accessories[1].icon).toBe(p.label);
  await fireAndClose(page, p.accessories[0]);
  await expect(page.locator(".mp-companion svg path[class^='mp-pet-a']")).toHaveCount(0);
  expect(await stored()).toEqual({ on: true, skin: "cassette", palette: "default", accessory: null });
  p = await pickerOf("cassette");
  expect(p.accessories[0].icon).toBe(p.label);
  await page.evaluate(() => (window as unknown as { __closeMenu: () => void }).__closeMenu());

  // No item the app sends inline has both an icon and nested items: Tauri reads that as a plain icon item and drops
  // the items (found in the real exe, DECISIONS.md C6a), which this fake doesn't model.
  const inline = (items: MenuItemArg[]): MenuItemArg[] => items.flatMap((i) => (Array.isArray(i) ? [] : [i, ...inline(i.items ?? [])]));
  for (const call of await ipcCalls(page, "plugin:menu|new"))
    for (const i of inline((call.args.options as { items?: MenuItemArg[] }).items ?? []))
      expect(i.icon !== undefined && i.items !== undefined, "an inline submenu with an icon").toBe(false);

  // Every picture, submenu and icon was made while no menu was open (Slice 4's deadlock rule): after a popup, the
  // menu is closed before the next of them.
  const calls = await page.evaluate(() => (window as unknown as { __ipcCalls: { cmd: string }[] }).__ipcCalls.map((c) => c.cmd));
  let open = false;
  for (const cmd of calls) {
    if (cmd === "plugin:menu|popup") open = true;
    if (cmd === "plugin:resources|close") open = false;
    if (["plugin:image|new", "plugin:menu|new", "plugin:menu|set_icon"].includes(cmd)) expect(open, `${cmd} while a menu was open`).toBe(false);
  }
});

test("wearing something (contract v12): saved worn, the sprite adds its slots, filled from --mp-acc-N, and the window is no bigger", async ({ page }) => {
  const scarf = skinJson("pilcrow").accessories!.scarf;
  await saveAppearance(page, "t1-default", { on: true, skin: "pilcrow", palette: "default", accessory: "scarf" });
  await fakeTauri(page, spotifyState(Date.now()));
  await page.goto("/");
  await expect(page.locator(".mp-companion")).toHaveCount(1);
  const shape = await page.locator(".mp-companion svg").evaluate((svg) => ({
    slots: [...svg.querySelectorAll("path")].map((p) => p.getAttribute("class")!),
    vars: Object.fromEntries([...(svg as SVGElement).style].filter((n) => n.startsWith("--mp-acc-")).map((n) => [n, (svg as SVGElement).style.getPropertyValue(n).trim()])),
    fill: getComputedStyle(svg.querySelector("path.mp-pet-a1")!).fill,
  }));
  for (const c of shape.slots) expect(c).toMatch(/^mp-pet-(c[1-8]|a[1-3])$/);
  expect(shape.slots).toContain("mp-pet-a1");
  expect(shape.vars).toEqual(Object.fromEntries(scarf.colours.map((c, i) => [`--mp-acc-${i + 1}`, c])));
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(scarf.colours[0].slice(i, i + 2), 16));
  expect(shape.fill).toBe(`rgb(${r}, ${g}, ${b})`);
  // The same margin as bare: what it wears fits the creature's box.
  const margin = await page.locator(".app-stage").evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
  expect(margin).toBe(spriteBoxPx(skinGrid("pilcrow"), artPixelPx(await page.evaluate(() => devicePixelRatio))));
});

test("saved on, a launch sizes the window with the margin but doesn't move it (the restored position already has the margin)", async ({ page }) => {
  await saveAppearance(page, "t1-default", { on: true, skin: "pilcrow", palette: "default" });
  await fakeTauri(page, spotifyState(Date.now()));
  await page.goto("/");
  await expect(page.locator(".mp-companion")).toHaveCount(1);
  const { width, height } = themeJson("t1-default").window;
  const margin = await page.locator(".app-stage").evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
  await expect
    .poll(async () => last(await ipcCalls(page, "plugin:window|set_size"))?.args.value)
    .toEqual({ Logical: { width: width + 2 * margin, height: height + 2 * margin } });
  expect(await ipcCalls(page, "plugin:window|set_position")).toEqual([]);
});

test("the parts match the contract: where they sit, what they carry, and that the pet takes the pointer and the hit region", async ({ page }) => {
  await saveAppearance(page, "t1-default", { on: true, skin: "pilcrow", palette: "default" });
  await fakeTauri(page, spotifyState(Date.now()));
  await page.goto("/");
  await expect(page.locator(".mp-companion")).toHaveCount(1);
  const shape = await page.evaluate(() => {
    const layer = document.querySelector(".mp-companion-layer")!;
    const pet = layer.querySelector(".mp-companion")!;
    const svg = pet.querySelector("svg")!;
    return {
      layerParent: layer.parentElement!.className,
      afterWindow: layer.previousElementSibling ? [...layer.parentElement!.children].indexOf(layer) > [...layer.parentElement!.children].indexOf(document.querySelector(".mp-window")!) : false,
      layerHidden: layer.getAttribute("aria-hidden"),
      layerPointer: getComputedStyle(layer).pointerEvents,
      petHidden: pet.getAttribute("aria-hidden"),
      petPointer: getComputedStyle(pet).pointerEvents,
      petNoDrag: pet.hasAttribute("data-no-drag"),
      state: pet.getAttribute("data-pet-state"),
      surface: pet.getAttribute("data-pet-surface"),
      transform: (pet as HTMLElement).style.transform,
      slots: [...svg.querySelectorAll("path")].map((p) => p.getAttribute("class")),
      vars: [...svg.style].filter((n) => n.startsWith("--mp-pet-")),
    };
  });
  expect(shape.layerParent).toContain("mp-root");
  expect(shape.afterWindow, ".mp-companion-layer comes after .mp-window").toBe(true);
  expect(shape).toMatchObject({ layerHidden: "true", layerPointer: "none", petHidden: "true", petPointer: "auto", petNoDrag: true });
  expect(PET_SURFACES).toContain(shape.surface);
  expect(PET_STATES).toContain(shape.state);
  expect(shape.transform).toMatch(/^translate\(/);
  for (const c of shape.slots) expect(c).toMatch(/^mp-pet-c[1-8]$/);
  expect(shape.vars.length).toBeGreaterThan(0);
  for (const v of shape.vars) expect(v).toMatch(/^--mp-pet-[1-8]$/);
  // Clicks over the pet reach the pet (C4b), and its box is part of the window's hit region, so the window takes clicks
  // there even out in the margin.
  const pet = (await page.locator(".mp-companion").boundingBox())!;
  const hit = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest(".mp-companion"), [pet.x + pet.width / 2, pet.y + pet.height / 2]);
  expect(hit, "the pet takes the click").toBe(true);
  await expect
    .poll(async () => {
      const box = await page.locator(".mp-companion").evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      const rects = last(await ipcCalls(page, "set_hit_region"))?.args.rects as (typeof box)[] | undefined;
      return rects?.some((r) => Math.abs(r.x - box.x) < 0.01 && Math.abs(r.y - box.y) < 0.01 && r.width === box.width && r.height === box.height);
    }, { message: "the pet's box is in the hit region" })
    .toBe(true);
});

/**
 * The pet's opaque pixels, as CSS-px boxes, read from its SVG: each frame row is drawn as 1-high runs
 * (`M x y h w v1 …`, spritePaths.ts), in art px, mirrored within the grid when it faces left (Sprite.tsx).
 * It first lets React finish what it has queued (see companion-brain.spec.ts: DevTools commands overtake React's
 * commits), in the same round trip: WebKit's are slow, and the time-lapse takes one per step.
 */
const snapshot = (page: Page) =>
  page.evaluate(async (partSelector) => {
    for (let i = 0; i < 4; i++)
      await new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = resolve;
        channel.port2.postMessage(0);
      });
    const pet = document.querySelector(".mp-companion")!;
    const svg = pet.querySelector("svg")!;
    const box = svg.getBoundingClientRect();
    const px = box.width / svg.viewBox.baseVal.width;
    const mirror = /translate\((\d+)/.exec(svg.querySelector("g")!.getAttribute("transform") ?? "");
    const pixels: { left: number; top: number; right: number; bottom: number }[] = [];
    for (const path of svg.querySelectorAll("path"))
      for (const [, xs, ys, ws] of path.getAttribute("d")!.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
        const w = Number(ws);
        const x = mirror ? Number(mirror[1]) - Number(xs) - w : Number(xs);
        const left = box.left + x * px;
        const top = box.top + Number(ys) * px;
        pixels.push({ left, top, right: left + w * px, bottom: top + px });
      }
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const parts = [...document.querySelectorAll(partSelector)]
      .map((el) => ({ part: el.className.toString(), ...rect(el) }))
      .filter((b) => b.right > b.left && b.bottom > b.top);
    return {
      state: pet.getAttribute("data-pet-state")!,
      surface: pet.getAttribute("data-pet-surface")!,
      pixels,
      parts,
      card: rect(document.querySelector(".mp-window")!),
    };
  }, PART_SELECTOR);

/** Lets React finish what it has queued (see companion-brain.spec.ts: DevTools commands overtake React's commits). */
const settle = (page: Page) =>
  page.evaluate(async () => {
    for (let i = 0; i < 4; i++)
      await new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = resolve;
        channel.port2.postMessage(0);
      });
  });

const EPS = 0.01;
const overlaps = (a: { left: number; top: number; right: number; bottom: number }, b: typeof a) =>
  a.left < b.right - EPS && b.left < a.right - EPS && a.top < b.bottom - EPS && b.top < a.bottom - EPS;

const STEP = 1000;

/**
 * The production player in its real window (the theme's size plus the pet's box on every side, C3b, so "inside the
 * window" is "inside the viewport") on a paused fake clock, and a `step` that moves time on by STEP and checks every
 * drawn pixel: inside the window, over no part, and off the card while the pet is off the card's top. Sized before the
 * page loads: shrinking it afterwards moves the card under a pet whose re-measure waits for an animation frame, and
 * under the paused fake clock that frame sometimes hadn't come by the first check (the moving card has its own test,
 * on the real clock, below).
 */
interface TimeLapseOptions {
  accessory?: string | null;
  /** Spotify's state, over the playing default (the gate's matrix). */
  state?: Partial<SpotifyState>;
  volume?: SpotifyVolume | null;
  /** Serve with the shipped CSP and collect problems (`problems()`). */
  watch?: boolean;
  reducedMotion?: boolean;
}
async function timeLapse(page: Page, theme: string, skin: string, { accessory = null, state = {}, volume = null, watch = false, reducedMotion = false }: TimeLapseOptions = {}) {
  const problems = watch ? await watchForProblems(page) : async () => [] as string[];
  if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  const margin = spriteBoxPx(skinGrid(skin), artPixelPx(await page.evaluate(() => devicePixelRatio)));
  const { width, height } = themeJson(theme).window;
  const view = { width: width + 2 * margin, height: height + 2 * margin };
  await page.setViewportSize(view);
  const t0 = Date.now();
  await saveAppearance(page, theme, { on: true, skin, palette: "default", accessory });
  await fakeTauri(page, spotifyState(t0, state), volume);
  await page.clock.install({ time: t0 });
  await page.goto("/");
  await page.locator(".mp-companion").waitFor();
  expect(await page.locator(".app-stage").evaluate((el) => parseFloat(getComputedStyle(el).paddingTop))).toBe(margin);
  await page.clock.pauseAt(t0 + 1000); // from here on, time moves only when the test moves it
  await settle(page);

  const seen = new Set<string>();
  let t = 0;
  const step = async (ms = STEP) => {
    await page.clock.runFor(ms);
    t += ms;
    const s = await snapshot(page);
    seen.add(`${s.surface}/${s.state}`);
    // Collected, then one expect a step: Playwright records every expect call as a step, and one per pixel and
    // part (~600 a step) took a 120 s time-lapse past its 3-minute timeout.
    const wrong = new Set<string>();
    // Carried or falling (contract v9), it may cross the card and any part but the artwork.
    const air = s.surface === "air";
    for (const p of s.pixels) {
      if (p.left < -EPS || p.top < -EPS || p.right > view.width + EPS || p.bottom > view.height + EPS) wrong.add("a pixel outside the window");
      for (const part of s.parts) if ((!air || /\bmp-artwork\b/.test(part.part)) && overlaps(p, part)) wrong.add(`a pixel over ${part.part}`);
      // On the shelf (contract v10) it's on the card by design, and still over no part; so is `over` at a shelf's door
      // (v11; at the top corners the skin validator keeps it off the card).
      const onCardOk = s.surface === "top" || s.surface === "shelf" || s.state === "over";
      if (!onCardOk && !air && overlaps(p, s.card)) wrong.add("a pixel on the card while off its top");
    }
    expect([...wrong], `${theme} × ${skin}: ${s.state} on ${s.surface}, t=${t} ms`).toEqual([]);
    return s;
  };
  const elapsed = () => t;
  /** It has climbed a side and hung under the bottom. */
  const around = () => (seen.has("left/climb") || seen.has("right/climb")) && seen.has("bottom/hang");
  const pause = () => emitSpotify(page, spotifyState(t0, { seq: 4, status: "paused" }));
  return { step, seen, elapsed, around, pause, problems };
}

/**
 * How long each time-lapse plays. A pet only reaches a corner when a walk runs out at an end of the top, and turns
 * half of those times, so on a real card a seed's first trip around can take more than half an hour (DECISIONS.md
 * 2026-10-29). Each pair plays a fixed stretch; the per-theme test below makes sure each layout gets a trip around.
 */
const PLAY = { chromium: 10 * 60_000, webkit: 3 * 60_000 } as Record<string, number>;

for (const [i, theme] of THEME_IDS.entries())
  for (const skin of SKIN_IDS)
    test(`time-lapse, ${theme} × ${skin}: wherever it goes, the pet stays inside the window, covers no part, and holds still once paused`, async ({ page, browserName }) => {
      // Every pair in Chromium. WebKit's DevTools round trips are ~10× Chromium's (companion-brain.spec.ts), so there it
      // runs one skin per theme, taking turns, which still covers every skin (docs/DECISIONS.md 2026-10-29).
      test.skip(browserName === "webkit" && skin !== SKIN_IDS[i % SKIN_IDS.length], "WebKit: one skin per theme");
      test.setTimeout(180_000);
      const run = await timeLapse(page, theme, skin);
      while (run.elapsed() < PLAY[browserName] && !run.around()) await run.step();
      for (const k of run.seen) {
        const [surface, state] = k.split("/");
        expect(PET_SURFACES, k).toContain(surface);
        expect(PET_STATES, k).toContain(state);
      }
      expect(run.seen, "it walked").toContain("top/walk");
      // Paused, wherever it is: within a minute it settles (asleep on the top, or holding still off it), then nothing
      // changes at all.
      await run.pause();
      for (let n = 0; n < 60; n++) await run.step();
      const held = JSON.stringify(await run.step());
      for (let n = 0; n < 30; n++) await page.clock.runFor(STEP);
      expect(JSON.stringify(await snapshot(page)), "still, paused").toBe(held);
    });

// Dressed (D2c): each theme with one species in one accessory, taking turns, so every species and every accessory
// lives on a real card. Chromium only: where it goes is the brain's arithmetic, and the unit tests run every placement
// rule for every outfit (place.test.ts, measure.test.ts).
const WEAR = ["headphones", "beanie", "scarf", "bow"];
const SPECIES_IDS = ["pilcrow", "bookworm", "cassette"];
for (const [i, theme] of THEME_IDS.entries()) {
  const skin = SPECIES_IDS[i % SPECIES_IDS.length];
  const accessory = WEAR[i % WEAR.length];
  test(`time-lapse dressed, ${theme} × ${skin} + ${accessory}: it stays inside the window and covers no part, wearing it`, async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "Chromium only: the same arithmetic");
    test.setTimeout(180_000);
    const run = await timeLapse(page, theme, skin, { accessory });
    await expect(page.locator(".mp-companion svg path.mp-pet-a1")).toHaveCount(1);
    while (run.elapsed() < PLAY[browserName] && !run.around()) await run.step();
    expect(run.seen, "it walked").toContain("top/walk");
  });
}

// The M2 milestone gate (PLAN.md §5): every theme × every state the production player can show (the fixture matrix,
// as Spotify's state: the strings are the dev fixtures'), served with the shipped CSP. The pet stays inside the window
// and over no part at every step, walks while the music plays and holds still once it doesn't, with no console error
// and nothing blocked. Species and accessories take turns. Chromium runs it all; WebKit each state once, in a theme
// that rotates.
const track = (name: string) => {
  const t = fixtures[name].track!;
  return { title: t.title, artist: t.artist, album: t.album ?? "", durationMs: t.durationMs! };
};
const NOTHING = { title: "", artist: "", album: "", artworkId: 0, artwork: null, positionMs: 0, durationMs: 0 };
const GATE_STATES: { name: string; state: Partial<SpotifyState>; volume?: SpotifyVolume; playing: boolean }[] = [
  { name: "playing, with volume", state: {}, volume: { available: true, level: 0.6 }, playing: true },
  { name: "long title + artist", state: track("long title + artist (overflow test)"), playing: true },
  { name: "CJK / accented", state: track("CJK / accented characters"), playing: true },
  { name: "emoji title", state: track("emoji title (split-flap falls back to plain text)"), playing: true },
  { name: "no artwork, no album", state: { ...track("no artwork, no album"), album: "", artworkId: 0, artwork: null }, playing: true },
  { name: "no seek, no volume", state: { canSeek: false }, playing: true },
  { name: "paused", state: { status: "paused" }, playing: false },
  { name: "nothing playing", state: { status: "idle", ...NOTHING }, playing: false },
  { name: "Spotify not running", state: { session: false, status: "idle", ...NOTHING }, playing: false },
];
const GATE_PLAY = { chromium: 3 * 60_000, webkit: 2 * 60_000 } as Record<string, number>;
for (const [t, theme] of THEME_IDS.entries())
  for (const [v, { name, state, volume, playing }] of GATE_STATES.entries()) {
    const k = t + v;
    const skin = SPECIES_IDS[k % SPECIES_IDS.length];
    const accessory = [null, ...WEAR][k % (WEAR.length + 1)];
    test(`M2 gate, ${theme} × ${name} (${skin}${accessory ? ` + ${accessory}` : ""}): inside the window, over no part, no error, nothing blocked`, async ({ page, browserName }) => {
      test.skip(browserName === "webkit" && k % THEME_IDS.length !== 0, "WebKit: each state once, in a rotating theme");
      test.setTimeout(240_000);
      const run = await timeLapse(page, theme, skin, { accessory, state, volume, watch: true });
      if (accessory) await expect(page.locator(".mp-companion svg path.mp-pet-a1")).toHaveCount(1);
      while (run.elapsed() < GATE_PLAY[browserName]) await run.step();
      if (playing) expect(run.seen, "it walked while the music played").toContain("top/walk");
      else {
        // The music is off: asleep on the top, or holding still off it, changing nothing.
        const held = JSON.stringify(await run.step());
        for (let n = 0; n < 30; n++) await page.clock.runFor(STEP);
        expect(JSON.stringify(await snapshot(page)), "still while the music is off").toBe(held);
        expect([...run.seen].filter((s) => /walk|climb/.test(s)), "it never moved").toEqual([]);
      }
      expect(await run.problems()).toEqual([]);
    });
  }

for (const theme of THEME_IDS)
  test(`around ${theme}: a pet climbs a side and hangs under the bottom, checked pixel by pixel all the way`, async ({ page, browserName }) => {
    // Engine-independent (where the pet goes is the brain's arithmetic); the pairs above run WebKit's layouts.
    test.skip(browserName === "webkit", "engine-independent time-lapse; Chromium covers it");
    test.setTimeout(180_000);
    const tried: string[] = [];
    // One species after another, each for up to half an hour of play, until one has been all the way around.
    for (const skin of SKIN_IDS) {
      const run = await timeLapse(page, theme, skin);
      while (run.elapsed() < 30 * 60_000 && !run.around()) await run.step();
      if (run.around()) return;
      tried.push(`${skin}: ${[...run.seen].sort().join(", ")}`);
    }
    expect(tried, "no species climbed a side and hung").toEqual([]);
  });

/** The pet's box in the page (the layer sits at the window's origin, so the transform the app set is page px). */
const petBox = (page: Page) =>
  page.evaluate(() => {
    const pet = document.querySelector(".mp-companion") as HTMLElement;
    const size = pet.querySelector("svg")!.width.baseVal.value;
    const [x, y] = (/translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(pet.style.transform) ?? []).slice(1).map(Number);
    return { x, y, size, mid: { x: x + size / 2, y: y + size / 2 } };
  });

/**
 * Waits (real time) until no view transition runs. T5's track-change morph wraps the swap in one (Chromium), and while
 * it runs the browser hit-tests everything as the root, so no part of the page, the pet included, takes the pointer
 * (DECISIONS.md 2026-11-01). WebKit here has no `:active-view-transition`, and no morph.
 */
const noViewTransition = (page: Page) =>
  page.waitForFunction(() => {
    try {
      return !document.documentElement.matches(":active-view-transition");
    } catch {
      return true;
    }
  });

for (const [i, theme] of THEME_IDS.entries())
  test(`pointer, ${theme}: a click makes it react; it's carried over the card but never the artwork, without dragging the window; dropped over the card it falls and catches an edge`, async ({ page }) => {
    test.setTimeout(120_000);
    const skin = SKIN_IDS[i % SKIN_IDS.length]; // a different species per theme
    const run = await timeLapse(page, theme, skin);
    let s = await run.step();
    expect(["idle", "walk", "sit"], `${theme} × ${skin}: awake on the top to begin with`).toContain(s.state);
    await noViewTransition(page);

    // A click: a reaction.
    let { mid } = await petBox(page);
    await page.mouse.click(mid.x, mid.y);
    s = await run.step(40);
    expect(s.state, "a click makes it react").toBe("react");

    // Picked up: in the air, and the window never started dragging.
    ({ mid } = await petBox(page));
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.down();
    await page.mouse.move(mid.x + 6, mid.y - 4, { steps: 3 });
    s = await run.step(40);
    expect(s, "picked up").toMatchObject({ state: "held", surface: "air" });

    // Over the artwork's middle: pushed off it (the step checks every pixel against it).
    const art = s.parts.find((p) => /\bmp-artwork\b/.test(p.part))!;
    expect(art, "the fake plays a track with artwork").toBeDefined();
    await page.mouse.move((art.left + art.right) / 2, (art.top + art.bottom) / 2, { steps: 4 });
    await run.step(40);

    // Over the card, as far from the artwork as a few candidate points allow, in the card's upper part.
    const c = s.card;
    const clear = (x: number, y: number) => x < art.left - 40 || x > art.right + 40 || y < art.top - 40 || y > art.bottom + 40;
    const spots = [0.8, 0.2, 0.5].flatMap((fx) => [0.35, 0.6].map((fy) => [c.left + fx * (c.right - c.left), c.top + fy * (c.bottom - c.top)]));
    const spot = spots.find(([x, y]) => clear(x, y));
    if (spot) {
      await page.mouse.move(spot[0], spot[1], { steps: 4 });
      s = await run.step(40);
      expect(s.pixels.some((p) => overlaps(p, s.card)), "carried over the card").toBe(true);
    }

    // Let go: through the air (a fall, every step checked), then on an edge of the card, at rest.
    await page.mouse.up();
    const states: string[] = [];
    for (let n = 0; n < 100 && (s = await run.step(40)).surface === "air"; n++) states.push(s.state);
    expect(["top", "right", "bottom", "left", "shelf"], `came to rest: ${s.state} on ${s.surface}`).toContain(s.surface);
    if (spot) {
      expect(states, "it fell").toContain("fall");
      // Or the shelf (C5b), if the spot was over it.
      expect([`bottom/hang`, `left/climb`, `right/climb`, `shelf/land`], "it caught an edge of the card").toContain(`${s.surface}/${s.state}`);
    }
    expect(await ipcCalls(page, "plugin:window|start_dragging"), "pressing the pet never drags the window").toEqual([]);
  });

for (const [i, theme] of THEME_IDS.entries())
  test(`shelf, ${theme}: dropped above the bottom-left corner it lands on the theme's shelf, level with the badge's base, and lives there over no part`, async ({ page, browserName }) => {
    test.setTimeout(150_000);
    const skin = SKIN_IDS[(i + 1) % SKIN_IDS.length]; // not the pointer test's species for this theme
    const shelf = (themeJson(theme) as { companion?: { shelf?: unknown } }).companion?.shelf;
    // Wearing something, taking turns (the gate): a dressed corner pose must still fit the shelf's door (D2c).
    const accessory = skinJson(skin).accessories ? WEAR[i % WEAR.length] : null;
    const run = await timeLapse(page, theme, skin, { accessory });
    let s = await run.step();
    await noViewTransition(page);
    const badge = s.parts.find((p) => /\bmp-source-badge\b/.test(p.part))!;
    expect(badge, "the badge is always there").toBeDefined();

    // Picked up, carried above the bottom-left corner beside the badge, and let go: every step of the fall checked.
    const { mid } = await petBox(page);
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.down();
    await page.mouse.move(mid.x + 6, mid.y - 4, { steps: 3 });
    s = await run.step(40);
    expect(s.surface, "picked up").toBe("air");
    await page.mouse.move(s.card.left + 30, badge.bottom - 70, { steps: 6 });
    await run.step(40);
    await page.mouse.up();
    for (let n = 0; n < 100 && (s = await run.step(40)).surface === "air"; n++);
    if (!shelf) {
      expect(s.surface, `${theme} has no shelf`).not.toBe("shelf");
      return;
    }
    expect(`${s.surface}/${s.state}`, "it landed on the shelf").toBe("shelf/land");
    const box = await petBox(page);
    expect(box.y + (anchorRow(skin, s.state) + 1) * (box.size / skinGrid(skin)), "standing level with the badge's base").toBeCloseTo(badge.bottom, 0);

    // Living there, every step checked (on the shelf: over no part); on and off it only by the left side.
    const moves = new Set<string>();
    let prev = s.surface;
    for (let n = 0; n < (browserName === "webkit" ? 60 : 600); n++) {
      s = await run.step();
      if (s.surface !== prev && (prev === "shelf" || s.surface === "shelf")) moves.add(`${prev}>${s.surface}`);
      prev = s.surface;
    }
    for (const m of moves) expect(["shelf>left", "left>shelf"], "on and off by the left side").toContain(m);
    expect(await ipcCalls(page, "plugin:window|start_dragging"), "pressing the pet never drags the window").toEqual([]);
  });

test("it rides a moving card: when the window resizes and the card moves under it, the pet follows (real clock)", async ({ page }) => {
  // Paused and under reduced motion, so nothing else in the card changes (no position ticks, no entry animations or
  // paused pulse, whose animationend re-measures too) and only the resize can set off a re-measure.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await saveAppearance(page, "t1-default", { on: true, skin: "pilcrow", palette: "default" });
  await fakeTauri(page, spotifyState(Date.now(), { status: "paused" }));
  await page.goto("/"); // Playwright's 1280-px-wide page: the card is centred far from the left
  await expect(page.locator(".mp-companion")).toHaveCount(1);
  // Where the pet's box is against the card: its middle over the card's width, its feet at the card's top. Read from
  // the transform the app set (the layer sits at the window's origin), not from the pet's layout box: after this
  // resize, Playwright's WebKit (Windows port) kept reporting the old box, even in computed style, for 5 s and across
  // animation frames, until a forced repaint, while drawing the pet in the right place (docs/DECISIONS.md 2026-10-29).
  const onCard = () =>
    page.evaluate(() => {
      const c = document.querySelector(".mp-window")!.getBoundingClientRect();
      const pet = document.querySelector(".mp-companion") as HTMLElement;
      const svg = pet.querySelector("svg")!;
      const [x, y] = (/translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(pet.style.transform) ?? []).slice(1).map(Number);
      const p = { left: x, top: y, right: x + svg.width.baseVal.value, bottom: y + svg.height.baseVal.value };
      const mid = (p.left + p.right) / 2;
      const where = `pet ${pet.getAttribute("data-pet-state")} on ${pet.getAttribute("data-pet-surface")} at (${p.left}, ${p.top}), card at (${c.left}, ${c.top})–(${c.right}, ${c.bottom})`;
      return { card: c.left, onCard: mid > c.left && mid < c.right && p.top < c.top && p.bottom > c.top, where };
    });
  expect(await page.evaluate(() => document.getAnimations().length), "nothing animating").toBe(0);
  const before = await onCard();
  expect(before.onCard, before.where).toBe(true);
  const margin = await page.locator(".app-stage").evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
  const { width, height } = themeJson("t1-default").window;
  await page.setViewportSize({ width: width + 2 * margin, height: height + 2 * margin }); // the real window (C3b)
  await expect.poll(async () => (await onCard()).card).toBeLessThan(before.card - 200); // the card did move
  await expect.poll(async () => ((r) => (r.onCard ? "on the card" : r.where))(await onCard())).toBe("on the card");
});

for (const [t, theme] of THEME_IDS.entries())
test(`under reduced motion the pet holds a still pose while the music plays, ${theme}`, async ({ page }) => {
  const t0 = Date.now();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await saveAppearance(page, theme, { on: true, skin: SPECIES_IDS[t % SPECIES_IDS.length], palette: "default", accessory: [null, ...WEAR][t % (WEAR.length + 1)] });
  await fakeTauri(page, spotifyState(t0));
  await page.clock.install({ time: t0 });
  await page.goto("/");
  await page.locator(".mp-companion").waitFor();
  await page.clock.pauseAt(t0 + 1000);
  await settle(page);
  await page.evaluate(() => {
    const w = window as unknown as { petChanges: number };
    w.petChanges = 0;
    new MutationObserver(() => w.petChanges++).observe(document.querySelector(".mp-companion")!, { attributes: true, childList: true, subtree: true });
  });
  for (let i = 0; i < 4; i++) {
    await page.clock.runFor(30_000);
    await settle(page);
  }
  expect(await page.evaluate(() => (window as unknown as { petChanges: number }).petChanges)).toBe(0);
});
