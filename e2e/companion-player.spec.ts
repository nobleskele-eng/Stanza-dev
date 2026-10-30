import { readdirSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { fixtures } from "../dev/fixtures/nowPlaying";
import type { SpotifyState } from "../src/adapters/spotifyFeed";
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
const skinGrid = (id: string) =>
  (JSON.parse(readFileSync(new URL(`../companions/${id}/companion.json`, import.meta.url), "utf8")) as { grid: number }).grid;
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
const PET_STATES = ["idle", "walk", "sit", "sleep", "wake", "react"]; // contract v7, C2b
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

/** A smaller fake than production.spec.ts's: IPC log, Spotify's state, native menus, and the window's position. */
async function fakeTauri(page: Page, spotify: SpotifyState) {
  await page.addInitScript(
    ({ spotify, at }) => {
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
    { spotify, at: AT },
  );
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

type MenuItemArg = { text?: string; checked?: boolean; icon?: number; handler?: string; item?: string };
/** Right-click the card, then fire the companion's on/off item (the menu's last) and close the menu. */
async function toggleFromMenu(page: Page) {
  const before = (await ipcCalls(page, "plugin:menu|popup")).length;
  const box = (await page.locator(".mp-window").boundingBox())!;
  await page.mouse.click(box.x + 20, box.y + 20, { button: "right" });
  await expect.poll(async () => (await ipcCalls(page, "plugin:menu|popup")).length).toBe(before + 1);
  const items = ((await ipcCalls(page, "plugin:menu|new")).at(-1)!.args.options as { items: MenuItemArg[] }).items;
  const toggle = items.at(-1)!;
  expect(items.at(-2)).toEqual({ item: "Separator" });
  await page.evaluate((h) => (window as unknown as { __fireChannel: (c: string, m: unknown) => void }).__fireChannel(h, "item"), toggle.handler!);
  await page.evaluate(() => (window as unknown as { __closeMenu: () => void }).__closeMenu());
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

test("the menu turns it on and off: the parts come and go, the window grows upward by the pet's box and back, the card stays put on screen, and it's saved", async ({ page }) => {
  await fakeTauri(page, spotifyState(Date.now()));
  await page.goto("/");
  const card = page.locator(".mp-window");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-status", "playing");
  const { width, height } = themeJson("t1-default").window;
  const y0 = (await card.boundingBox())!.y;

  // On.
  const off = await toggleFromMenu(page);
  // An icon with no text (docs/DECISIONS.md 2026-10-22): the first image made is the asleep cassette, since it was off.
  expect(off).toEqual({ text: "", icon: 500, handler: expect.any(String) });
  await expect(page.locator(".mp-companion")).toHaveCount(1);
  const margin = await page.locator(".app-stage").evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
  expect(margin).toBeGreaterThan(0);
  expect(margin % 4, "the margin is a sprite box, a multiple of the 4 px layout grid").toBe(0);
  await expect.poll(async () => last(await ipcCalls(page, "plugin:window|set_size")).args.value).toEqual({ Logical: { width, height: height + margin } });
  await expect.poll(async () => last(await ipcCalls(page, "plugin:window|set_position"))?.args.value).toEqual({ Logical: { x: AT.x, y: AT.y - margin } });
  // The window moved up by the margin and the card moved down inside it by the same: on screen it didn't move.
  expect((await card.boundingBox())!.y).toBeCloseTo(y0 + margin, 5);
  let stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), APPEARANCE_STORAGE_KEY);
  expect(stored.companion).toMatchObject({ on: true });

  // Off again: the item shows the awake cassette now; everything goes back.
  const on = await toggleFromMenu(page);
  expect(on).toMatchObject({ text: "", icon: 501 }); // now the awake cassette
  expect(on).not.toHaveProperty("checked");
  await expect(page.locator(".mp-companion-layer, .mp-companion")).toHaveCount(0);
  await expect.poll(async () => last(await ipcCalls(page, "plugin:window|set_size")).args.value).toEqual({ Logical: { width, height } });
  await expect.poll(async () => last(await ipcCalls(page, "plugin:window|set_position")).args.value).toEqual({ Logical: { x: AT.x, y: AT.y + margin } });
  expect((await card.boundingBox())!.y).toBeCloseTo(y0, 5);
  stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), APPEARANCE_STORAGE_KEY);
  expect(stored.companion).toMatchObject({ on: false });
});

test("saved on, a launch sizes the window with the margin but doesn't move it (the restored position already has the margin)", async ({ page }) => {
  await saveAppearance(page, "t1-default", { on: true, skin: "pilcrow", palette: "default" });
  await fakeTauri(page, spotifyState(Date.now()));
  await page.goto("/");
  await expect(page.locator(".mp-companion")).toHaveCount(1);
  const { width, height } = themeJson("t1-default").window;
  const margin = await page.locator(".app-stage").evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
  await expect.poll(async () => last(await ipcCalls(page, "plugin:window|set_size"))?.args.value).toEqual({ Logical: { width, height: height + margin } });
  expect(await ipcCalls(page, "plugin:window|set_position")).toEqual([]);
});

test("the parts match the contract: where they sit, what they carry, and that they never take input", async ({ page }) => {
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
      state: pet.getAttribute("data-pet-state"),
      surface: pet.getAttribute("data-pet-surface"),
      transform: (pet as HTMLElement).style.transform,
      slots: [...svg.querySelectorAll("path")].map((p) => p.getAttribute("class")),
      vars: [...svg.style].filter((n) => n.startsWith("--mp-pet-")),
    };
  });
  expect(shape.layerParent).toContain("mp-root");
  expect(shape.afterWindow, ".mp-companion-layer comes after .mp-window").toBe(true);
  expect(shape).toMatchObject({ layerHidden: "true", layerPointer: "none", petHidden: "true", petPointer: "none", surface: "top" });
  expect(PET_STATES).toContain(shape.state);
  expect(shape.transform).toMatch(/^translate\(/);
  for (const c of shape.slots) expect(c).toMatch(/^mp-pet-c[1-8]$/);
  expect(shape.vars.length).toBeGreaterThan(0);
  for (const v of shape.vars) expect(v).toMatch(/^--mp-pet-[1-8]$/);
  // Clicks over the pet reach the card under it, never the pet.
  const pet = (await page.locator(".mp-companion svg").boundingBox())!;
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest(".mp-companion") ?? null, [pet.x + pet.width / 2, pet.y + pet.height - 1]);
  expect(hit).toBeNull();
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
    return { state: pet.getAttribute("data-pet-state")!, x: box.left, pixels, parts, card: rect(document.querySelector(".mp-window")!) };
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

for (const [i, theme] of THEME_IDS.entries())
  for (const skin of SKIN_IDS)
    test(`time-lapse, ${theme} × ${skin}: the pet stays inside the window over the card's width and never covers a part`, async ({ page, browserName }) => {
      // Every pair in Chromium. WebKit's DevTools round trips are ~10× Chromium's (companion-brain.spec.ts), so there it
      // runs one skin per theme, taking turns, which still covers every skin (docs/DECISIONS.md 2026-10-29).
      test.skip(browserName === "webkit" && skin !== SKIN_IDS[i % SKIN_IDS.length], "WebKit: one skin per theme");
      test.setTimeout(180_000);
      // The real window from the start: the theme's size plus the pet's box on top, so "inside the window" is "inside
      // the viewport". Sized before the page loads: shrinking it afterwards moves the card under a pet whose re-measure
      // waits for an animation frame, and under the paused fake clock that frame sometimes hadn't come by the first
      // check (the moving card has its own test, on the real clock, below).
      const margin = spriteBoxPx(skinGrid(skin), artPixelPx(await page.evaluate(() => devicePixelRatio)));
      const { width, height } = themeJson(theme).window;
      await page.setViewportSize({ width, height: height + margin });
      const t0 = Date.now();
      await saveAppearance(page, theme, { on: true, skin, palette: "default" });
      await fakeTauri(page, spotifyState(t0));
      await page.clock.install({ time: t0 });
      await page.goto("/");
      await page.locator(".mp-companion").waitFor();
      expect(await page.locator(".app-stage").evaluate((el) => parseFloat(getComputedStyle(el).paddingTop))).toBe(margin);
      await page.clock.pauseAt(t0 + 1000); // from here on, time moves only when the test moves it
      await settle(page);

      const seen = new Set<string>();
      const xs = new Set<number>();
      // 90 s of playing in 500 ms steps, then 30 s paused: long enough to fall asleep and hold still.
      for (let t = 0; t < 120_000; t += 500) {
        if (t === 90_000) await emitSpotify(page, spotifyState(t0, { seq: 4, status: "paused" }));
        await page.clock.runFor(500);
        const s = await snapshot(page);
        seen.add(s.state);
        xs.add(Math.round(s.x));
        // Collected, then one expect a step: Playwright records every expect call as a step, and one per pixel and
        // part (~600 a step) took a 120 s time-lapse past its 3-minute timeout.
        const wrong = new Set<string>();
        for (const p of s.pixels) {
          if (p.top < -EPS) wrong.add("a pixel above the window's top");
          if (p.left < s.card.left - EPS) wrong.add("a pixel left of the card");
          if (p.right > s.card.right + EPS) wrong.add("a pixel right of the card");
          for (const part of s.parts) if (overlaps(p, part)) wrong.add(`a pixel over ${part.part}`);
        }
        expect([...wrong], `${s.state} at x=${s.x}, t=${t + 500} ms`).toEqual([]);
      }
      for (const state of seen) expect(PET_STATES).toContain(state);
      expect(seen, "paused, it fell asleep (DROWSY_MS after the pause)").toContain("sleep");
      expect(xs.size, "the pet walked at least once in 90 s of music").toBeGreaterThan(1);
    });

test("it rides a moving card: when the window resizes and the card moves under it, the pet follows (real clock)", async ({ page }) => {
  // Paused and under reduced motion, so nothing else in the card changes (no position ticks, no entry animations or
  // paused pulse, whose animationend re-measures too) and only the resize can set off a re-measure.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await saveAppearance(page, "t1-default", { on: true, skin: "pilcrow", palette: "default" });
  await fakeTauri(page, spotifyState(Date.now(), { status: "paused" }));
  await page.goto("/"); // Playwright's 1280-px-wide page: the card is centred far from the left
  await expect(page.locator(".mp-companion")).toHaveCount(1);
  // Where the pet's box is against the card: its middle over the card's width, its feet at the card's top.
  const onCard = () =>
    page.evaluate(() => {
      const c = document.querySelector(".mp-window")!.getBoundingClientRect();
      const p = document.querySelector(".mp-companion svg")!.getBoundingClientRect();
      const mid = p.left + p.width / 2;
      return { card: c.left, onCard: mid > c.left && mid < c.right && p.top < c.top && p.bottom > c.top };
    });
  expect(await page.evaluate(() => document.getAnimations().length), "nothing animating").toBe(0);
  const before = await onCard();
  expect(before.onCard).toBe(true);
  const margin = await page.locator(".app-stage").evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
  const { width, height } = themeJson("t1-default").window;
  await page.setViewportSize({ width, height: height + margin });
  await expect.poll(async () => (await onCard()).card).toBeLessThan(before.card - 200); // the card did move
  await expect.poll(async () => (await onCard()).onCard).toBe(true);
});

test("under reduced motion the pet holds a still pose while the music plays", async ({ page }) => {
  const t0 = Date.now();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await saveAppearance(page, "t1-default", { on: true, skin: "pilcrow", palette: "default" });
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
