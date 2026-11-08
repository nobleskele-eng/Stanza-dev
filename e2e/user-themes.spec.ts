import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { fixtures } from "../dev/fixtures/nowPlaying";
import type { SpotifyState } from "../src/adapters/spotifyFeed";
import { CONTRACT_VERSION } from "../src/theme/variant";

// User themes (M3 L2, PLAN.md §4 "Loading and hot swap"): the production bundle in a fake Tauri whose `user_themes`
// answers with the synthetic fixture theme in dev/fixtures/user-themes/, served the way Tauri's asset protocol serves
// a theme folder. The page gets the shipped CSP, so the blob: shell and the asset origin are allowed by it or the test
// fails. Rust's own checks are `cargo test` (src-tauri/src/themes.rs); the real asset protocol is checked in the exe
// (DECISIONS.md M3 L2).
test.use({ baseURL: "http://localhost:4173" });

const APPEARANCE_STORAGE_KEY = "mp.appearance.v1";
const BUNDLED = ["t1-default", "t2-artwork", "t3-pill", "t4-extreme", "t5-kinetic"];
const FIXTURE_DIR = "dev/fixtures/user-themes";
const FAKE_ROOT = String.raw`C:\fake\themes`;
const fixtureJson = (id: string) => JSON.parse(readFileSync(`${FIXTURE_DIR}/${id}/theme.json`, "utf8")) as Record<string, unknown> & { name: string; window: { width: number; height: number } };
const PAPER = fixtureJson("fixture-paper");
const INK = fixtureJson("fixture-ink");
/** The paper fixture as if edited while the app runs (M3 L3): its theme.json and theme.css. */
const EDITS_DIR = "dev/fixtures/user-theme-edits";
const PAPER_V2 = JSON.parse(readFileSync(`${EDITS_DIR}/fixture-paper/theme.json`, "utf8")) as typeof PAPER;
const themeName = (id: string) => (JSON.parse(readFileSync(`themes/${id}/theme.json`, "utf8")) as { name: string }).name;
const CSP = (JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")) as { app: { security: { csp: string } } }).app.security.csp;

const TYPICAL = fixtures["typical / all caps"].track!;
const spotify: SpotifyState = {
  seq: 3,
  session: true,
  status: "paused",
  title: TYPICAL.title,
  artist: TYPICAL.artist,
  album: TYPICAL.album!,
  artworkId: 1,
  artwork: fixtures["colorful artwork (filter test)"].track!.artwork!,
  positionMs: 1000,
  durationMs: TYPICAL.durationMs!,
  positionUpdatedAt: Date.now(),
  canSeek: true,
} as SpotifyState;

/** A `user_themes` entry the way Rust sends a good folder. */
const okEntry = (folder: string, manifest: unknown = fixtureJson(folder)) => ({
  kind: "ok",
  folder,
  manifest,
  css: `${FAKE_ROOT}\\${folder}\\theme.css`,
});

type IpcCall = { cmd: string; args: Record<string, unknown> };

/**
 * The fake: IPC log, `user_themes`, Tauri's `convertFileSrc` (whole path as one encoded segment, like the real one),
 * native menus, events (`__emit`), and the asset protocol serving `C:\fake\themes\…` from dev/fixtures/user-themes/
 * (403 outside it, like the scope; 404 for a file that isn't there). `files` stands in for edits on disk: a theme
 * file (`fixture-paper/theme.css`) to the file served instead, or null for gone. Also collects CSP violations and
 * errors.
 */
async function fakeTauri(page: Page, entries: unknown[], { userThemesDelayMs = 0 } = {}) {
  await page.route(
    (url) => url.pathname === "/" || url.pathname.endsWith(".html"),
    async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": CSP } });
    },
  );
  const served: string[] = [];
  const files = new Map<string, string | null>();
  const asset = { delayMs: 0 };
  await page.route("http://asset.localhost/**", async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)).replace(/\\/g, "/");
    const prefix = FAKE_ROOT.replace(/\\/g, "/") + "/";
    if (!path.startsWith(prefix)) return route.fulfill({ status: 403, body: "" });
    const rel = path.slice(prefix.length);
    const file = files.has(rel) ? files.get(rel) : `${FIXTURE_DIR}/${rel}`;
    if (asset.delayMs) await new Promise((r) => setTimeout(r, asset.delayMs));
    if (!file || !existsSync(file)) return route.fulfill({ status: 404, body: "" });
    served.push(rel);
    const type = file.endsWith(".css") ? "text/css" : file.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream";
    return route.fulfill({ status: 200, contentType: type, body: readFileSync(file) });
  });
  await page.addInitScript(
    ({ entries, spotify, userThemesDelayMs }) => {
      let listed = entries;
      const calls: IpcCall[] = [];
      const callbacks = new Map<number, (raw: unknown) => void>();
      let nextCallback = 1;
      let nextRid = 100;
      let closeOpenMenu: (() => void) | null = null;
      const seen: string[] = [];
      window.addEventListener("securitypolicyviolation", (e) => seen.push(`CSP: ${e.violatedDirective} ${e.blockedURI}`), true);
      // What the very first .mp-root painted with, and whether a user theme's sheet had loaded by then.
      const firstPaint: { theme?: string | null; sheetLoaded?: boolean } = {};
      new MutationObserver((_, obs) => {
        const root = document.querySelector(".mp-root");
        if (!root) return;
        const link = document.querySelector<HTMLLinkElement>("link[data-mp-user-theme]");
        firstPaint.theme = root.getAttribute("data-theme");
        firstPaint.sheetLoaded = !!link?.sheet;
        obs.disconnect();
      }).observe(document, { childList: true, subtree: true });
      Object.assign(window, {
        isTauri: true,
        __ipcCalls: calls,
        __cspViolations: seen,
        __firstPaint: firstPaint,
        // What `user_themes` answers from now on (the folder as it is after an edit).
        __setUserThemes: (next: unknown[]) => void (listed = next),
        // Delivers an event the way Rust emits one.
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
          convertFileSrc: (path: string, protocol = "asset") => `http://${protocol}.localhost/${encodeURIComponent(path)}`,
          invoke: (cmd: string, args: unknown) => {
            calls.push({ cmd, args: JSON.parse(JSON.stringify(args ?? {})) });
            if (cmd === "user_themes") {
              const answer = JSON.parse(JSON.stringify(listed));
              return userThemesDelayMs ? new Promise((r) => setTimeout(() => r(answer), userThemesDelayMs)) : Promise.resolve(answer);
            }
            if (cmd === "plugin:menu|new") return Promise.resolve([nextRid, `menu-${nextRid++}`]);
            if (cmd === "plugin:image|new") return Promise.resolve(nextRid++);
            if (cmd === "plugin:menu|popup") return new Promise((resolve) => (closeOpenMenu = () => resolve(null)));
            if (cmd === "plugin:window|outer_position") return Promise.resolve({ x: 100, y: 300 });
            if (cmd === "plugin:window|scale_factor") return Promise.resolve(1);
            if (cmd === "spotify_state") return Promise.resolve(spotify);
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
    { entries, spotify, userThemesDelayMs },
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  const warnings: string[] = [];
  page.on("console", async (m) => {
    if (m.type() === "warning") warnings.push(JSON.stringify(await Promise.all(m.args().map((a) => a.jsonValue()))));
  });
  return {
    served,
    files,
    asset,
    warnings,
    errors,
    problems: async () => [...errors, ...(await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations))],
  };
}

const ipcCalls = (page: Page, cmd: string) =>
  page.evaluate((c) => (window as unknown as { __ipcCalls: IpcCall[] }).__ipcCalls.filter((x) => x.cmd === c), cmd);
const saveTheme = (page: Page, theme: string, companion?: object) =>
  page.addInitScript(
    ([key, theme, contract, companion]) =>
      localStorage.setItem(
        key as string,
        JSON.stringify({ theme, variant: { theme, contract, layout: "card", overrides: {}, hidden: [] }, ...(companion ? { companion } : {}) }),
      ),
    [APPEARANCE_STORAGE_KEY, theme, CONTRACT_VERSION, companion ?? null] as const,
  );
const stored = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null"), APPEARANCE_STORAGE_KEY);

type MenuItem = { text?: string; checked?: boolean; handler?: string; item?: string };
/**
 * Right-clicks the card and returns the theme items (the ones before the first separator); the menu stays open.
 * `quiet`: the right-click as a bare event, so the pointer never moves and no hover style changes a frame's look.
 */
async function themeItems(page: Page, { quiet = false } = {}): Promise<MenuItem[]> {
  const before = (await ipcCalls(page, "plugin:menu|popup")).length;
  const box = (await page.locator(".mp-window").boundingBox())!;
  if (quiet)
    await page.evaluate(
      ([x, y]) => document.querySelector(".mp-window")!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y })),
      [box.x + 20, box.y + 20],
    );
  else await page.mouse.click(box.x + 20, box.y + 20, { button: "right" });
  await expect.poll(async () => (await ipcCalls(page, "plugin:menu|popup")).length).toBe(before + 1);
  const items = ((await ipcCalls(page, "plugin:menu|new")).at(-1)!.args.options as { items: MenuItem[] }).items;
  const sep = items.findIndex((i) => i.item === "Separator");
  return sep === -1 ? items : items.slice(0, sep);
}
async function pick(page: Page, item: MenuItem) {
  await page.evaluate((h) => (window as unknown as { __fireChannel: (c: string, m: unknown) => void }).__fireChannel(h, "item"), item.handler!);
  await page.evaluate(() => (window as unknown as { __closeMenu: () => void }).__closeMenu());
}
/** What the fixture theme's CSS does, read off the page. */
const paperLook = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector(".mp-root")!;
    const art = document.querySelector(".mp-artwork");
    return {
      theme: root.getAttribute("data-theme"),
      marker: getComputedStyle(root).getPropertyValue("--fixture-paper-loaded").trim(),
      background: getComputedStyle(document.querySelector(".mp-window")!).backgroundImage,
      artOpacity: art ? getComputedStyle(art).opacity : null,
      sheets: [...document.querySelectorAll("link[data-mp-user-theme]")].map((l) => (l as HTMLLinkElement).dataset.mpUserTheme),
    };
  });
const lastSize = async (page: Page) => (await ipcCalls(page, "plugin:window|set_size")).at(-1)?.args.value;

test("a user theme is offered after the five bundled ones, by its theme.json name", async ({ page }) => {
  const fake = await fakeTauri(page, [okEntry("fixture-paper")]);
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "t1-default");
  const items = await themeItems(page);
  expect(items.map((i) => i.text)).toEqual([...BUNDLED.map(themeName), PAPER.name]);
  expect(items.map((i) => i.checked)).toEqual([true, false, false, false, false, false]);
  expect((await ipcCalls(page, "user_themes")).length).toBe(1);
  // Nothing of it is loaded until it's picked.
  expect(fake.served).toEqual([]);
  expect(await fake.problems()).toEqual([]);
});

test("picking it loads its CSS into the theme layer first, then applies, sizes and saves it", async ({ page }) => {
  const fake = await fakeTauri(page, [okEntry("fixture-paper")]);
  await page.goto("/");
  await expect(page.locator(".mp-artwork")).toBeVisible();
  await pick(page, (await themeItems(page))[5]);
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "fixture-paper");
  const look = await paperLook(page);
  expect(look).toMatchObject({ theme: "fixture-paper", marker: "1", artOpacity: "1", sheets: ["fixture-paper"] });
  // Its relative url(bg.svg) resolved inside its own folder, and the asset protocol served it.
  expect(look.background).toContain("/fake/themes/fixture-paper/bg.svg");
  await expect.poll(() => fake.served).toEqual(["fixture-paper/theme.css", "fixture-paper/bg.svg"]);
  await expect.poll(() => lastSize(page)).toEqual({ Logical: PAPER.window });
  expect(await stored(page)).toMatchObject({ theme: "fixture-paper", variant: { theme: "fixture-paper", layout: "card", overrides: {}, hidden: [] } });
  // Its sheet sits in the theme layer: a user-layer rule still beats it, and its !important can't beat the guard.
  await page.evaluate(() => {
    const s = new CSSStyleSheet();
    s.replaceSync(`@layer user { .mp-root[data-theme] { --fixture-paper-loaded: 2; } }`);
    document.adoptedStyleSheets = [s];
  });
  expect((await paperLook(page)).marker).toBe("2");
  expect(await fake.problems()).toEqual([]);
});

test("a saved user theme paints first time with its CSS already loaded", async ({ page }) => {
  await saveTheme(page, "fixture-paper", { on: false, skin: "bookworm", palette: "default", accessory: null });
  const fake = await fakeTauri(page, [okEntry("fixture-paper")]);
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "fixture-paper");
  expect(await page.evaluate(() => (window as unknown as { __firstPaint: object }).__firstPaint)).toEqual({ theme: "fixture-paper", sheetLoaded: true });
  expect((await paperLook(page)).marker).toBe("1");
  await expect.poll(() => lastSize(page)).toEqual({ Logical: PAPER.window });
  expect(await stored(page)).toMatchObject({ theme: "fixture-paper", companion: { skin: "bookworm" } });
  // The menu checks it.
  expect((await themeItems(page)).map((i) => i.checked)).toEqual([false, false, false, false, false, true]);
  expect(await fake.problems()).toEqual([]);
});

test("switching to a bundled theme removes the user theme's sheet; switching back loads it again", async ({ page }) => {
  await saveTheme(page, "fixture-paper");
  const fake = await fakeTauri(page, [okEntry("fixture-paper")]);
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "fixture-paper");
  await pick(page, (await themeItems(page))[1]);
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "t2-artwork");
  await expect.poll(async () => (await paperLook(page)).sheets).toEqual([]);
  expect((await stored(page)).theme).toBe("t2-artwork");
  await pick(page, (await themeItems(page))[5]);
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "fixture-paper");
  expect(await paperLook(page)).toMatchObject({ marker: "1", sheets: ["fixture-paper"] });
  expect(await fake.problems()).toEqual([]);
});

test("broken, clashing and refused themes are never offered; their codes are logged", async ({ page }) => {
  const fake = await fakeTauri(page, [
    { kind: "broken", folder: "aa-no-css", error: "no-css" },
    okEntry("t2-artwork", { ...PAPER, id: "t2-artwork" }),
    okEntry("fixture-paper", { ...PAPER, contract: CONTRACT_VERSION - 1 }),
    okEntry("fixture-paper", { ...PAPER, fx: { shapes: "please" } }),
  ]);
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "t1-default");
  expect((await themeItems(page)).map((i) => i.text)).toEqual(BUNDLED.map(themeName));
  await expect.poll(() => fake.warnings.join("\n")).toContain("no-css");
  const logged = fake.warnings.join("\n");
  for (const code of ["no-css", "id-taken", "contract-mismatch", "bad-fx"]) expect(logged).toContain(code);
  expect(fake.served).toEqual([]);
  expect(await fake.problems()).toEqual([]);
});

test("a saved user theme that's gone falls back to the default theme, keeping the companion, and is rewritten", async ({ page }) => {
  await saveTheme(page, "fixture-paper", { on: true, skin: "cassette", palette: "default", accessory: null });
  const fake = await fakeTauri(page, []);
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "t1-default");
  await expect(page.locator(".mp-companion")).toHaveCount(1);
  expect(await stored(page)).toMatchObject({ theme: "t1-default", companion: { on: true, skin: "cassette" } });
  expect(await fake.problems()).toEqual([]);
});

test("a user theme whose CSS won't load: picking it changes nothing; saved, the default theme opens instead", async ({ page }) => {
  // Listed fine, but its theme.css is gone by the time it's loaded (the fake answers 404).
  const missing = { ...okEntry("fixture-paper"), css: `${FAKE_ROOT}\\fixture-paper\\gone.css` };
  await fakeTauri(page, [missing]);
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "t1-default");
  await pick(page, (await themeItems(page))[5]);
  await page.waitForTimeout(500);
  expect(await paperLook(page)).toMatchObject({ theme: "t1-default", sheets: [] });
  expect((await stored(page)).theme).toBe("t1-default");

  const again = await page.context().newPage();
  await saveTheme(again, "fixture-paper", { on: false, skin: "pilcrow", palette: "default", accessory: null });
  await fakeTauri(again, [missing]);
  await again.goto("/");
  await expect(again.locator(".mp-root")).toHaveAttribute("data-theme", "t1-default");
  expect(await paperLook(again)).toMatchObject({ sheets: [] });
  expect((await stored(again)).theme).toBe("t1-default");
});

// --- Live reload (M3 L3): Rust's watcher sends `themes:changed` with the folders that changed
// (src-tauri/src/theme_watch.rs; checked with a real watcher in `cargo test` and in the exe). Here the fake answers
// `user_themes` with the folder as it is after the edit and serves the edited files, then emits the event.

/** The folder now holds `entries` (and the files in `fake.files`); Rust reports these folders changed. */
async function edited(page: Page, entries: unknown[], folders: string[], all = false) {
  await page.evaluate(
    ([e, f, a]) => {
      const w = window as unknown as { __setUserThemes: (e: unknown[]) => void; __emit: (n: string, p: unknown) => void };
      w.__setUserThemes(e as unknown[]);
      w.__emit("themes:changed", { folders: f, all: a });
    },
    [entries, folders, all] as const,
  );
}
/** The paper fixture edited on disk: its new theme.css served, its new theme.json listed. */
const editPaper = (fake: Awaited<ReturnType<typeof fakeTauri>>) => {
  fake.files.set("fixture-paper/theme.css", `${EDITS_DIR}/fixture-paper/theme.css`);
  return okEntry("fixture-paper", PAPER_V2);
};
const closeMenu = (page: Page) => page.evaluate(() => (window as unknown as { __closeMenu: () => void }).__closeMenu());

type Frame = { key: string; look: string; n: number };
/**
 * Records every frame the page draws, read in requestAnimationFrame (just before the frame's style and paint): the
 * theme on screen with its fixture version (the fixtures' `--fixture-*-loaded`), and its look (the card's computed
 * colours, background, corners, shadow, padding, width, font). Runs of identical frames are counted.
 *
 * Transitions and animations are switched off (in the guard layer, so nothing beats it): they're how a theme moves
 * between looks on purpose, not loading. Even reduced motion's 0.001 ms clamp (structure.css) starts a transition on
 * every changed property, and WebKit draws its first frame at the old value (DECISIONS.md M3 L3).
 */
const recordFrames = (page: Page) =>
  page.addInitScript(() => {
    const still = new CSSStyleSheet();
    still.replaceSync(`@layer guard { *, *::before, *::after { transition: none !important; animation: none !important; } }`);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, still];
    const frames: { key: string; look: string; n: number }[] = [];
    const read = () => {
      const root = document.querySelector(".mp-root");
      const card = document.querySelector(".mp-window");
      if (!root || !card) return null;
      const r = getComputedStyle(root);
      const c = getComputedStyle(card);
      const version = ["--fixture-paper-loaded", "--fixture-ink-loaded"].map((p) => r.getPropertyValue(p).trim()).join("");
      // The card's own properties only: its children (the title) come and go with the track, not the theme.
      const look = [c.backgroundColor, c.backgroundImage, c.borderTopLeftRadius, c.boxShadow, c.paddingTop, c.paddingLeft, c.width, c.color, c.fontFamily];
      return { key: `${root.getAttribute("data-theme")}#${version}`, look: look.join(" | ") };
    };
    const tick = () => {
      const f = read();
      const last = frames.at(-1);
      if (f && last && last.key === f.key && last.look === f.look) last.n++;
      else if (f) frames.push({ ...f, n: 1 });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    Object.assign(window, { __frames: frames });
  });
const framesSoFar = (page: Page) => page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames);
/** The theme and version in the last frame drawn (waiting on this, not the DOM, means the state was painted). */
const lastDrawn = (page: Page) => page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames.at(-1)?.key ?? null);
/**
 * No unstyled or mixed frame: each theme (and fixture version) was drawn exactly one way, and a user theme never
 * without its CSS. A frame with the new theme but not yet its CSS, or the old version's rules still mixed into the new,
 * would be a second look for that key (or a user theme with no version).
 */
function expectCleanFrames(frames: Frame[]) {
  const looks = new Map<string, Set<string>>();
  for (const f of frames) {
    if (!looks.has(f.key)) looks.set(f.key, new Set());
    looks.get(f.key)!.add(f.look);
  }
  for (const [key, set] of looks) {
    expect(set.size, `${key} was drawn ${set.size} ways:\n${[...set].join("\n")}`).toBe(1);
    const [theme, version] = key.split("#");
    if (theme.startsWith("fixture-")) expect(version, `${theme} drawn without its CSS`).not.toBe("");
  }
  return looks;
}
const onScreen = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector(".mp-root");
    if (!root) return null; // not painted yet
    const r = getComputedStyle(root);
    return `${root.getAttribute("data-theme")}#${["--fixture-paper-loaded", "--fixture-ink-loaded"].map((p) => r.getPropertyValue(p).trim()).join("")}`;
  });

test("editing the theme on screen: its new CSS and theme.json take over in one frame, the old sheet goes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await saveTheme(page, "fixture-paper", { on: false, skin: "pilcrow", palette: "default", accessory: null });
  await recordFrames(page);
  const fake = await fakeTauri(page, [okEntry("fixture-paper")]);
  await page.goto("/");
  await expect.poll(() => onScreen(page)).toBe("fixture-paper#1");
  await expect.poll(() => lastSize(page)).toEqual({ Logical: PAPER.window });
  const sizesBefore = (await ipcCalls(page, "plugin:window|set_size")).length;

  await edited(page, [editPaper(fake)], ["fixture-paper"]);
  await expect.poll(() => onScreen(page)).toBe("fixture-paper#2");
  const look = await paperLook(page);
  expect(look).toMatchObject({ marker: "2", artOpacity: "1", sheets: ["fixture-paper"] });
  expect(look.background).toContain("/fake/themes/fixture-paper/bg.svg");
  // Bigger now: the window grew to fit both before the swap (here that's already the new size), then stays at it.
  await expect
    .poll(async () => (await ipcCalls(page, "plugin:window|set_size")).slice(sizesBefore).map((c) => c.args.value))
    .toEqual([{ Logical: PAPER_V2.window }]);
  // The menu shows the new name; the theme stays saved as it was.
  expect((await themeItems(page)).map((i) => i.text).at(-1)).toBe(PAPER_V2.name);
  expect(await stored(page)).toMatchObject({ theme: "fixture-paper", companion: { skin: "pilcrow" } });
  // Fetched afresh (a second theme.css), listed twice (launch, the edit).
  expect(fake.served.filter((f) => f === "fixture-paper/theme.css")).toHaveLength(2);
  expect((await ipcCalls(page, "user_themes")).length).toBe(2);
  const looks = expectCleanFrames(await framesSoFar(page));
  expect([...looks.keys()]).toEqual(["fixture-paper#1", "fixture-paper#2"]);
  expect(await fake.problems()).toEqual([]);
});

test("a change in another folder leaves the theme on screen alone; added and removed themes come and go in the menu", async ({ page }) => {
  await saveTheme(page, "fixture-paper");
  const fake = await fakeTauri(page, [okEntry("fixture-paper")]);
  await page.goto("/");
  await expect.poll(() => onScreen(page)).toBe("fixture-paper#1");
  await edited(page, [okEntry("fixture-ink"), okEntry("fixture-paper")], ["fixture-ink"]);
  await expect
    .poll(async () => {
      const texts = (await themeItems(page)).map((i) => i.text);
      await closeMenu(page);
      return texts;
    })
    .toEqual([...BUNDLED.map(themeName), INK.name, PAPER.name]);
  await edited(page, [okEntry("fixture-paper")], ["fixture-ink"]);
  await expect
    .poll(async () => {
      const texts = (await themeItems(page)).map((i) => i.text);
      await closeMenu(page);
      return texts;
    })
    .toEqual([...BUNDLED.map(themeName), PAPER.name]);
  // Its CSS was never fetched again.
  expect(fake.served.filter((f) => f.endsWith(".css"))).toEqual(["fixture-paper/theme.css"]);
  expect(await paperLook(page)).toMatchObject({ theme: "fixture-paper", marker: "1", sheets: ["fixture-paper"] });
  expect(await fake.problems()).toEqual([]);
});

test("the theme on screen breaks mid-edit: it stays as it last loaded, still offered, until a save that checks out", async ({ page }) => {
  await saveTheme(page, "fixture-paper");
  const fake = await fakeTauri(page, [okEntry("fixture-paper")]);
  await page.goto("/");
  await expect.poll(() => onScreen(page)).toBe("fixture-paper#1");
  await edited(page, [{ kind: "broken", folder: "fixture-paper", error: "not-json" }], ["fixture-paper"]);
  await expect.poll(() => fake.warnings.join("\n")).toContain("not-json");
  expect((await themeItems(page)).map((i) => i.text).at(-1)).toBe(PAPER.name);
  await closeMenu(page);
  expect(await paperLook(page)).toMatchObject({ theme: "fixture-paper", marker: "1", sheets: ["fixture-paper"] });
  // A theme.json the frontend refuses counts the same.
  await edited(page, [okEntry("fixture-paper", { ...PAPER, fx: { shapes: "please" } })], ["fixture-paper"]);
  await expect.poll(() => fake.warnings.join("\n")).toContain("bad-fx");
  expect(await onScreen(page)).toBe("fixture-paper#1");
  await edited(page, [editPaper(fake)], ["fixture-paper"]);
  await expect.poll(() => onScreen(page)).toBe("fixture-paper#2");
  expect(await fake.problems()).toEqual([]);
});

test("its new CSS won't load (mid-write): the old stays on screen; the next save applies", async ({ page }) => {
  await saveTheme(page, "fixture-paper");
  const fake = await fakeTauri(page, [okEntry("fixture-paper")]);
  await page.goto("/");
  await expect.poll(() => onScreen(page)).toBe("fixture-paper#1");
  fake.files.set("fixture-paper/theme.css", null);
  await edited(page, [okEntry("fixture-paper")], ["fixture-paper"]);
  await expect.poll(() => fake.errors.join("\n")).toContain("user theme failed to load");
  expect(await paperLook(page)).toMatchObject({ theme: "fixture-paper", marker: "1", sheets: ["fixture-paper"] });
  await edited(page, [editPaper(fake)], ["fixture-paper"]);
  await expect.poll(() => onScreen(page)).toBe("fixture-paper#2");
  expect((await paperLook(page)).sheets).toEqual(["fixture-paper"]);
});

test("the theme on screen deleted: the default theme takes over with the companion kept, saved, and it leaves the menu", async ({ page }) => {
  await saveTheme(page, "fixture-paper", { on: true, skin: "cassette", palette: "default", accessory: null });
  const fake = await fakeTauri(page, [okEntry("fixture-ink"), okEntry("fixture-paper")]);
  await page.goto("/");
  await expect.poll(() => onScreen(page)).toBe("fixture-paper#1");
  await edited(page, [okEntry("fixture-ink")], [], true);
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "t1-default");
  await expect(page.locator(".mp-companion")).toHaveCount(1);
  expect(await stored(page)).toMatchObject({ theme: "t1-default", companion: { on: true, skin: "cassette" } });
  await expect.poll(async () => (await paperLook(page)).sheets).toEqual([]);
  expect((await themeItems(page)).map((i) => i.text)).toEqual([...BUNDLED.map(themeName), INK.name]);
  expect(await fake.problems()).toEqual([]);
});

test("saves arriving while a reload loads are merged into one more reload, ending on the latest", async ({ page }) => {
  await saveTheme(page, "fixture-paper");
  const fake = await fakeTauri(page, [okEntry("fixture-paper")]);
  await page.goto("/");
  await expect.poll(() => onScreen(page)).toBe("fixture-paper#1");
  fake.asset.delayMs = 400;
  const v2 = editPaper(fake);
  for (let i = 0; i < 4; i++) await edited(page, [v2], ["fixture-paper"]);
  await expect.poll(() => onScreen(page)).toBe("fixture-paper#2");
  await page.waitForTimeout(1200);
  // Launch, the first save, then the three that came while it loaded, as one.
  expect((await ipcCalls(page, "user_themes")).length).toBe(3);
  expect((await paperLook(page)).sheets).toEqual(["fixture-paper"]);
  expect(await fake.problems()).toEqual([]);
});

test("a theme edited while not on screen shows its latest CSS when picked", async ({ page }) => {
  const fake = await fakeTauri(page, [okEntry("fixture-paper")]);
  await page.goto("/");
  await pick(page, (await themeItems(page))[5]);
  await expect.poll(() => onScreen(page)).toBe("fixture-paper#1");
  await pick(page, (await themeItems(page))[0]);
  await expect.poll(() => onScreen(page)).toBe("t1-default#");
  await edited(page, [editPaper(fake)], ["fixture-paper"]);
  await expect
    .poll(async () => {
      const last = (await themeItems(page)).at(-1)!.text;
      await closeMenu(page);
      return last;
    })
    .toBe(PAPER_V2.name);
  await pick(page, (await themeItems(page))[5]);
  await expect.poll(() => onScreen(page)).toBe("fixture-paper#2");
  expect(await fake.problems()).toEqual([]);
});

test("the themes change while the menu is open: the next menu has them, and no menu is left behind", async ({ page }) => {
  const fake = await fakeTauri(page, [okEntry("fixture-paper")]);
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "t1-default");
  await themeItems(page); // open, and stays open
  await edited(page, [okEntry("fixture-ink"), okEntry("fixture-paper")], ["fixture-ink"]);
  await expect.poll(async () => (await ipcCalls(page, "user_themes")).length).toBe(2);
  await page.waitForTimeout(200); // the new list rendered while the menu is still open
  await closeMenu(page);
  expect((await themeItems(page)).map((i) => i.text)).toEqual([...BUNDLED.map(themeName), INK.name, PAPER.name]);
  await closeMenu(page);
  await themeItems(page);
  // Three right-clicks, one menu and its picker alive: each request closed the one before, none was stranded.
  const made = (await ipcCalls(page, "plugin:menu|new")).length;
  const closed = (await ipcCalls(page, "plugin:resources|close")).length;
  expect(made).toBe(6);
  expect(made - closed).toBe(2);
  expect(await fake.problems()).toEqual([]);
});

test("a save made while the app is still listing the themes at launch is not missed", async ({ page }) => {
  // Rust is slow to answer the launch listing; the save lands meanwhile, before the app has rendered.
  const fake = await fakeTauri(page, [], { userThemesDelayMs: 600 });
  await page.goto("/");
  await expect.poll(async () => (await ipcCalls(page, "user_themes")).length).toBe(1);
  await edited(page, [okEntry("fixture-paper")], ["fixture-paper"]);
  await expect
    .poll(
      async () => {
        const last = (await themeItems(page)).at(-1)!.text;
        await closeMenu(page);
        return last;
      },
      { timeout: 5000 },
    )
    .toBe(PAPER.name);
  expect((await ipcCalls(page, "user_themes")).length).toBe(2);
  // The listener was there before the listing.
  const cmds = await page.evaluate(() => (window as unknown as { __ipcCalls: IpcCall[] }).__ipcCalls.map((c) => c.cmd));
  expect(cmds.indexOf("plugin:event|listen")).toBeLessThan(cmds.indexOf("user_themes"));
  expect(await fake.problems()).toEqual([]);
});

// The M3 L3 gate (PLAN.md): 20 swaps, every frame recorded, none unstyled or mixed. Picks between bundled and user
// themes (both ways, and user to user) and live edits of the theme on screen, back and forth, plus edits made off
// screen that the next pick must show.
test("gate: 20 swaps (picks and live edits), every frame drawn styled, never a mix", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await recordFrames(page);
  const fake = await fakeTauri(page, [okEntry("fixture-ink"), okEntry("fixture-paper")]);
  await page.goto("/");
  await expect.poll(() => lastDrawn(page)).toBe("t1-default#");
  let paper = 1;
  const listing = () => [okEntry("fixture-ink"), paper === 2 ? okEntry("fixture-paper", PAPER_V2) : okEntry("fixture-paper")];
  const name = (id: string) => (id === "fixture-paper" ? (paper === 2 ? PAPER_V2 : PAPER).name : id === "fixture-ink" ? INK.name : themeName(id));
  const expected = (id: string) => `${id}#${id === "fixture-paper" ? paper : id === "fixture-ink" ? 1 : ""}`;
  async function pickById(id: string) {
    const items = await themeItems(page, { quiet: true });
    const item = items.find((i) => i.text === name(id));
    expect(item, `${name(id)} in ${items.map((i) => i.text).join(", ")}`).toBeTruthy();
    await pick(page, item!);
    await expect.poll(() => lastDrawn(page)).toBe(expected(id));
  }
  async function editPaperTo(v: 1 | 2) {
    paper = v;
    if (v === 2) fake.files.set("fixture-paper/theme.css", `${EDITS_DIR}/fixture-paper/theme.css`);
    else fake.files.delete("fixture-paper/theme.css");
    await edited(page, listing(), ["fixture-paper"]);
  }
  const steps: (string | 1 | 2)[] = [
    "fixture-paper", 2, "t2-artwork", "fixture-ink", "fixture-paper", 1, 2, "t3-pill", 1, "fixture-paper", "fixture-ink",
    "t4-extreme", "fixture-paper", 2, "t5-kinetic", 1, "fixture-ink", "fixture-paper", 2, "t1-default", "fixture-paper", 1,
  ];
  let swaps = 0;
  let current = "t1-default";
  for (const step of steps) {
    if (typeof step === "string") {
      await pickById(step);
      current = step;
      swaps++;
    } else if (current === "fixture-paper") {
      await editPaperTo(step);
      await expect.poll(() => lastDrawn(page)).toBe(expected("fixture-paper"));
      swaps++;
    } else {
      // Off screen: only the menu changes; the next pick of it must show this version.
      await editPaperTo(step);
      await expect
        .poll(async () => {
          const last = (await themeItems(page, { quiet: true })).at(-1)!.text;
          await closeMenu(page);
          return last;
        })
        .toBe(name("fixture-paper"));
    }
  }
  expect(swaps).toBe(20);
  // A few frames past the last swap, so its settled look is recorded too.
  await page.waitForTimeout(300);
  const frames = await framesSoFar(page);
  // DUMP_FRAMES=<file>: every recorded frame, for finding which swap drew a second look.
  if (process.env.DUMP_FRAMES) writeFileSync(process.env.DUMP_FRAMES, JSON.stringify(frames, null, 1));
  const looks = expectCleanFrames(frames);
  expect([...looks.keys()].sort()).toEqual(["fixture-ink#1", "fixture-paper#1", "fixture-paper#2", ...BUNDLED.map((id) => `${id}#`)].sort());
  // Every swap was drawn (each step waited for its frame): each changes the theme or its version from one frame to the next.
  const changes = frames.filter((f, i) => i > 0 && f.key !== frames[i - 1].key).length;
  expect(changes, "swaps seen in the frames").toBeGreaterThanOrEqual(20);
  // At rest only the theme on screen has a sheet; one menu (and its picker) alive.
  expect((await paperLook(page)).sheets).toEqual(["fixture-paper"]);
  const live = (await ipcCalls(page, "plugin:menu|new")).length - (await ipcCalls(page, "plugin:resources|close")).length;
  expect(live).toBeLessThanOrEqual(2);
  expect(await fake.problems()).toEqual([]);
});
