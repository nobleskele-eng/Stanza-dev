import { existsSync, readFileSync } from "node:fs";
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
 * native menus, and the asset protocol serving `C:\fake\themes\…` from dev/fixtures/user-themes/ (403 outside it,
 * like the scope; 404 for a file that isn't there). Also collects CSP violations and errors.
 */
async function fakeTauri(page: Page, entries: unknown[]) {
  await page.route(
    (url) => url.pathname === "/" || url.pathname.endsWith(".html"),
    async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": CSP } });
    },
  );
  const served: string[] = [];
  await page.route("http://asset.localhost/**", async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)).replace(/\\/g, "/");
    const prefix = FAKE_ROOT.replace(/\\/g, "/") + "/";
    if (!path.startsWith(prefix)) return route.fulfill({ status: 403, body: "" });
    const file = `${FIXTURE_DIR}/${path.slice(prefix.length)}`;
    if (!existsSync(file)) return route.fulfill({ status: 404, body: "" });
    served.push(path.slice(prefix.length));
    const type = file.endsWith(".css") ? "text/css" : file.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream";
    return route.fulfill({ status: 200, contentType: type, body: readFileSync(file) });
  });
  await page.addInitScript(
    ({ entries, spotify }) => {
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
            if (cmd === "user_themes") return Promise.resolve(entries);
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
    { entries, spotify },
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
    warnings,
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
/** Right-clicks the card and returns the theme items (the ones before the first separator); the menu stays open. */
async function themeItems(page: Page): Promise<MenuItem[]> {
  const before = (await ipcCalls(page, "plugin:menu|popup")).length;
  const box = (await page.locator(".mp-window").boundingBox())!;
  await page.mouse.click(box.x + 20, box.y + 20, { button: "right" });
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
