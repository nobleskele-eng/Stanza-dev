import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { CONTRACT_VERSION } from "../src/theme/variant";

// The settings window (M3 L4a): the production bundle in a fake Tauri, as either window. As "settings" it must show
// the rail, the companion's pictures and Reset, every word from COPY.md, and only ever *ask* the player (events);
// as "main" (the player) it must open it from the gear picture, apply what it asks, and report back. The real second
// window, its dark title bar and the events between two real webviews are checked in the exe (DECISIONS.md M3 L4a).
test.use({ baseURL: "http://localhost:4173" });

const KEY = "mp.appearance.v1";
const NEEDS_COPY = "[NEEDS COPY]";
const CSP = (JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")) as { app: { security: { csp: string } } }).app.security.csp;
const skinJson = (id: string) =>
  JSON.parse(readFileSync(`companions/${id}/companion.json`, "utf8")) as { palettes: Record<string, string[]>; accessories?: Record<string, unknown> };
const T1 = JSON.parse(readFileSync("themes/t1-default/theme.json", "utf8")) as { window: { width: number; height: number } };

type IpcCall = { cmd: string; args: Record<string, unknown> };
type Companion = { on: boolean; skin: string; palette: string; accessory: string | null };

/** The fake: IPC log, events (`__emit`), native menus, this window's label; collects CSP violations and errors. */
async function fakeTauri(page: Page, label: "main" | "settings") {
  await page.route(
    (url) => url.pathname === "/" || url.pathname.endsWith(".html"),
    async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": CSP } });
    },
  );
  await page.addInitScript((label) => {
    const calls: IpcCall[] = [];
    const callbacks = new Map<number, (raw: unknown) => void>();
    let nextCallback = 1;
    let nextRid = 100;
    let closeOpenMenu: (() => void) | null = null;
    const seen: string[] = [];
    window.addEventListener("securitypolicyviolation", (e) => seen.push(`CSP: ${e.violatedDirective} ${e.blockedURI}`), true);
    Object.assign(window, {
      isTauri: true,
      __ipcCalls: calls,
      __cspViolations: seen,
      __emit: (event: string, payload: unknown) => {
        for (const c of calls) {
          const a = c.args as { event?: string; handler?: number };
          if (c.cmd === "plugin:event|listen" && a.event === event) callbacks.get(a.handler!)?.({ event, id: 1, payload });
        }
      },
      __fireChannel: (channel: string, message: unknown) => callbacks.get(Number(channel.replace("__CHANNEL__:", "")))?.({ index: 0, message }),
      __closeMenu: () => {
        const close = closeOpenMenu;
        closeOpenMenu = null;
        close?.();
      },
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label }, currentWebview: { windowLabel: label, label } },
        convertFileSrc: (path: string, protocol = "asset") => `http://${protocol}.localhost/${encodeURIComponent(path)}`,
        invoke: (cmd: string, args: unknown) => {
          calls.push({ cmd, args: JSON.parse(JSON.stringify(args ?? {})) });
          if (cmd === "user_themes") return Promise.resolve([]);
          if (cmd === "plugin:menu|new") return Promise.resolve([nextRid, `menu-${nextRid++}`]);
          if (cmd === "plugin:image|new") return Promise.resolve(nextRid++);
          if (cmd === "plugin:menu|popup") return new Promise((resolve) => (closeOpenMenu = () => resolve(null)));
          if (cmd === "plugin:window|outer_position") return Promise.resolve({ x: 100, y: 300 });
          if (cmd === "plugin:window|scale_factor") return Promise.resolve(1);
          return Promise.resolve(null);
        },
        transformCallback: (cb: (raw: unknown) => void) => {
          callbacks.set(nextCallback, cb);
          return nextCallback++;
        },
        unregisterCallback: (id: number) => callbacks.delete(id),
      },
    });
  }, label);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  return {
    problems: async () => [...errors, ...(await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations))],
  };
}

const save = (page: Page, theme: string, companion: Companion) =>
  page.addInitScript(
    ([key, theme, contract, companion]) =>
      localStorage.setItem(
        key as string,
        JSON.stringify({ theme, variant: { theme, contract, layout: theme === "t3-pill" ? "pill" : "card", overrides: {}, hidden: [] }, companion }),
      ),
    [KEY, theme, CONTRACT_VERSION, companion] as const,
  );
const stored = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null"), KEY);
const ipc = (page: Page, cmd: string) =>
  page.evaluate((c) => (window as unknown as { __ipcCalls: IpcCall[] }).__ipcCalls.filter((x) => x.cmd === c), cmd);
/** Events this window sent to another one: `[target label, event, payload]`. */
const sent = async (page: Page) =>
  (await ipc(page, "plugin:event|emit_to")).map((c) => [(c.args.target as { label: string }).label, c.args.event, c.args.payload ?? null]);
const emit = (page: Page, event: string, payload?: unknown) =>
  page.evaluate(([e, p]) => (window as unknown as { __emit: (e: string, p: unknown) => void }).__emit(e as string, p), [event, payload] as const);

const OFF: Companion = { on: false, skin: "pilcrow", palette: "default", accessory: null };
const DRESSED: Companion = { on: true, skin: "cassette", palette: "clear", accessory: "beanie" };

// --- The settings window ---

test.describe("the settings window", () => {
  test("opens on the themes section: the rail, its heading and Reset, words only from COPY.md", async ({ page }) => {
    const fake = await fakeTauri(page, "settings");
    await page.goto("/");
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(2);
    // Nothing written yet: every slot shows [NEEDS COPY], never words of the app's own.
    await expect(tabs).toHaveText([NEEDS_COPY, NEEDS_COPY]);
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(NEEDS_COPY);
    await expect(page.getByRole("tabpanel").getByRole("button")).toHaveText([NEEDS_COPY]);
    // Stanza's ink, edge to edge.
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".st-root")!).backgroundColor)).toBe("rgb(11, 11, 13)");
    // It's not the player: no player, no Spotify, no themes listed, no user CSS, no menu.
    await expect(page.locator(".mp-root")).toHaveCount(0);
    for (const cmd of ["spotify_state", "user_themes", "plugin:menu|new"]) expect(await ipc(page, cmd), cmd).toEqual([]);
    expect(await page.locator("link[data-mp-user-theme]").count()).toBe(0);
    // It listens for the player's reports, then says hello so the player sends one.
    await expect.poll(() => sent(page)).toEqual([["main", "settings:hello", null]]);
    const cmds = await page.evaluate(() => (window as unknown as { __ipcCalls: IpcCall[] }).__ipcCalls.map((c) => c.cmd));
    expect(cmds.indexOf("plugin:event|listen")).toBeLessThan(cmds.indexOf("plugin:event|emit_to"));
    expect(await fake.problems()).toEqual([]);
  });

  test("the companion section shows the saved setting, then follows what the player reports", async ({ page }) => {
    await save(page, "t1-default", DRESSED);
    const fake = await fakeTauri(page, "settings");
    await page.goto("/");
    await page.getByRole("tab").nth(1).click();
    await expect(page.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");
    const toggle = page.getByRole("switch");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(toggle).toHaveAccessibleName(NEEDS_COPY);
    const rows = page.locator(".st-row");
    await expect(rows).toHaveCount(3);
    // Every species; the current one's five palettes; bare plus its four accessories. The choices pressed.
    const pressed = (row: number) => rows.nth(row).locator(".st-pic").evaluateAll((els) => els.map((e) => e.getAttribute("aria-pressed")));
    expect(await pressed(0)).toEqual(["false", "false", "true"]);
    expect(await pressed(1)).toEqual(Object.keys(skinJson("cassette").palettes).map((p) => String(p === "clear")));
    expect(await pressed(2)).toEqual([null, ...Object.keys(skinJson("cassette").accessories!)].map((a) => String(a === "beanie")));
    // Each picture is a real sprite, named for screen readers from COPY.md ([NEEDS COPY] until written).
    expect(await rows.nth(0).locator(".st-pic svg path").count()).toBeGreaterThan(3);
    await expect(rows.nth(1).locator(".st-pic").first()).toHaveAccessibleName(NEEDS_COPY);

    // The player reports a change (made from its own menu, say).
    await emit(page, "appearance:changed", { theme: "t2-artwork", companion: { on: false, skin: "pilcrow", palette: "ink", accessory: null } });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect.poll(() => pressed(0)).toEqual(["true", "false", "false"]);
    expect(await pressed(1)).toEqual(Object.keys(skinJson("pilcrow").palettes).map((p) => String(p === "ink")));
    expect((await pressed(2))[0]).toBe("true"); // wearing nothing
    expect(await fake.problems()).toEqual([]);
  });

  test("picking a picture or the switch asks the player, and saves nothing itself", async ({ page }) => {
    await save(page, "t1-default", DRESSED);
    const fake = await fakeTauri(page, "settings");
    await page.goto("/");
    await page.getByRole("tab").nth(1).click();
    const before = await stored(page);
    await page.locator(".st-row").nth(0).locator(".st-pic").nth(1).click(); // bookworm
    await page.getByRole("switch").click();
    await expect
      .poll(async () => (await sent(page)).filter(([, e]) => e === "settings:companion"))
      .toEqual([
        // Like the menu: picking means wanting to see it (on), in its default palette, still wearing the beanie it has.
        ["main", "settings:companion", { on: true, skin: "bookworm", palette: "default", accessory: "beanie" }],
        // The switch: just on/off. (The player hasn't answered here, so it still shows the saved setting.)
        ["main", "settings:companion", { ...DRESSED, on: false }],
      ]);
    expect(await stored(page)).toEqual(before);
    expect(await fake.problems()).toEqual([]);
  });

  test("Reset appearance asks first: cancel and Escape do nothing, confirm asks the player", async ({ page }) => {
    const fake = await fakeTauri(page, "settings");
    await page.goto("/");
    const reset = page.getByRole("tabpanel").getByRole("button");
    const dialog = page.getByRole("dialog");
    await reset.click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName(NEEDS_COPY);
    const [cancel, confirm] = await dialog.getByRole("button").all();
    await expect(cancel).toBeFocused(); // the safe one
    await cancel.click();
    await expect(dialog).toBeHidden();
    await reset.click();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect((await sent(page)).filter(([, e]) => e === "settings:reset")).toEqual([]);
    await reset.click();
    await confirm.click();
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await sent(page)).filter(([, e]) => e === "settings:reset")).toEqual([["main", "settings:reset", null]]);
    expect(await fake.problems()).toEqual([]);
  });

  test("by keyboard: arrows move between sections, everything is reachable, focus always shows", async ({ page, browserName }) => {
    await fakeTauri(page, "settings");
    await page.goto("/");
    const tabs = page.getByRole("tab");
    await tabs.first().focus();
    await page.keyboard.press("ArrowDown");
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("End");
    await expect(tabs.nth(1)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(tabs.first()).toBeFocused();
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowUp"); // wraps to the last
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    // Tab order: WebKit (like Safari) only Tabs to buttons when the system says so, so this part is WebView2's
    // (Chromium's). From a fresh page (blur() keeps Chromium's Tab starting point): one tab stop for the rail, the
    // selected tab, then into the section.
    if (browserName !== "chromium") return;
    await page.reload();
    await page.keyboard.press("Tab");
    await expect(tabs.first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Tab");
    const toggle = page.getByRole("switch");
    await expect(toggle).toBeFocused();
    expect(await toggle.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
    await page.keyboard.press("Tab");
    const first = page.locator(".st-pic[aria-pressed]").first();
    await expect(first).toBeFocused();
    expect(await first.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
    // The chosen picture keeps its own ring while focused.
    expect(await first.evaluate((el) => getComputedStyle(el).boxShadow)).toContain("193, 67, 46");
  });

  test("a report that makes no sense is taken field by field, never trusted", async ({ page }) => {
    const fake = await fakeTauri(page, "settings");
    await page.goto("/");
    await page.getByRole("tab").nth(1).click();
    await emit(page, "appearance:changed", { theme: 3, companion: { on: "yes", skin: "dragon", palette: "<b>", accessory: 7 } });
    await emit(page, "appearance:changed", "nonsense");
    await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    await expect(page.locator(".st-row").first().locator(".st-pic").first()).toHaveAttribute("aria-pressed", "true");
    expect(await fake.problems()).toEqual([]);
  });
});

// --- The player's side ---

type MenuItem = { text?: string; icon?: unknown; handler?: string; item?: string };
async function menuItems(page: Page): Promise<MenuItem[]> {
  const before = (await ipc(page, "plugin:menu|popup")).length;
  const box = (await page.locator(".mp-window").boundingBox())!;
  await page.mouse.click(box.x + 20, box.y + 20, { button: "right" });
  await expect.poll(async () => (await ipc(page, "plugin:menu|popup")).length).toBe(before + 1);
  return ((await ipc(page, "plugin:menu|new")).at(-1)!.args.options as { items: MenuItem[] }).items;
}

test.describe("the player and the settings window", () => {
  test("the right-click menu ends with the gear picture, which opens the settings window titled from COPY.md", async ({ page }) => {
    const fake = await fakeTauri(page, "main");
    await page.goto("/");
    await expect(page.locator(".mp-root")).toBeVisible();
    const items = await menuItems(page);
    const [sep, gear] = items.slice(-2);
    expect(sep).toEqual({ item: "Separator" });
    expect(gear).toMatchObject({ text: "" });
    expect(typeof gear.icon).toBe("number"); // a picture, no words
    // The gear is the last of the pictures made: 16 × 16 at 100 %, 32 × 32 at 200 % (the WebKit project's scale).
    const side = 16 * Math.floor(await page.evaluate(() => devicePixelRatio));
    const images = await ipc(page, "plugin:image|new");
    expect(images.at(-1)!.args).toMatchObject({ width: side, height: side });
    await page.evaluate((h) => (window as unknown as { __fireChannel: (c: string, m: unknown) => void }).__fireChannel(h, "item"), gear.handler!);
    await page.evaluate(() => (window as unknown as { __closeMenu: () => void }).__closeMenu());
    await expect.poll(() => ipc(page, "open_settings")).toEqual([{ cmd: "open_settings", args: { title: NEEDS_COPY } }]);
    expect(await fake.problems()).toEqual([]);
  });

  test("the player answers hello, applies a companion the settings window asks for, and reports every change", async ({ page }) => {
    await save(page, "t1-default", OFF);
    const fake = await fakeTauri(page, "main");
    await page.goto("/");
    await expect(page.locator(".mp-root")).toBeVisible();
    const reports = async () => (await sent(page)).filter(([to, e]) => to === "settings" && e === "appearance:changed").map(([, , p]) => p);
    await expect.poll(async () => (await reports()).length).toBeGreaterThan(0); // its state at start
    const n = (await reports()).length;
    await emit(page, "settings:hello");
    await expect.poll(async () => (await reports()).slice(n)).toEqual([{ theme: "t1-default", companion: OFF }]);

    await emit(page, "settings:companion", DRESSED);
    await expect(page.locator(".mp-companion")).toHaveCount(1);
    expect((await stored(page)).companion).toEqual(DRESSED);
    await expect.poll(async () => (await reports()).at(-1)).toEqual({ theme: "t1-default", companion: DRESSED });

    // Asked for something that isn't a companion: checked field by field, so nothing bad is saved.
    await emit(page, "settings:companion", { on: true, skin: "dragon", palette: 4 });
    await expect.poll(async () => (await stored(page)).companion).toEqual({ on: true, skin: "pilcrow", palette: "default", accessory: null });
    expect(await fake.problems()).toEqual([]);
  });

  test("Reset appearance: back to the default theme with nothing customised, the companion kept, saved and sized", async ({ page }) => {
    await save(page, "t2-artwork", DRESSED);
    const fake = await fakeTauri(page, "main");
    await page.goto("/");
    await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "t2-artwork");
    await emit(page, "settings:reset");
    await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "t1-default");
    expect(await stored(page)).toEqual({
      theme: "t1-default",
      variant: { theme: "t1-default", contract: CONTRACT_VERSION, layout: "card", overrides: {}, hidden: [] },
      companion: DRESSED,
    });
    await expect(page.locator(".mp-companion")).toHaveCount(1);
    // T1's window, plus the companion's margin on every side.
    await expect
      .poll(async () => ((await ipc(page, "plugin:window|set_size")).at(-1)?.args.value as { Logical: { width: number } })?.Logical.width)
      .toBeGreaterThan(T1.window.width);
    // Already on the default theme: still a reset (nothing customised), still no change to the companion.
    await emit(page, "settings:reset");
    await page.waitForTimeout(200);
    expect((await stored(page)).companion).toEqual(DRESSED);
    expect(await fake.problems()).toEqual([]);
  });
});
