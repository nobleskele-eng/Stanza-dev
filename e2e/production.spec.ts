import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fixtures } from "../dev/fixtures/nowPlaying";
import type { SpotifyState, SpotifyVolume } from "../src/adapters/spotifyFeed";
import { CONTRACT_VERSION } from "../src/theme/variant";

// Written out rather than imported (appearance.ts pulls theme.json files in via the registry). Changing the key
// silently discards every user's saved appearance, so this test should fail if it changes.
const APPEARANCE_STORAGE_KEY = "mp.appearance.v1";

// The production bundle (no DEV harness) rendered in a page whose background is omitted.
// The real window is transparent (S1 / PLAN.md D11), so anything the page paints behind
// the rounded player shows up as a visible rectangle at the corners.
test.use({ baseURL: "http://localhost:4173" });

test("nothing is painted behind the rounded player: corner pixel has no painted rectangle (only T1's faint ambient shadow)", async ({ page }) => {
  await page.goto("/");
  const win = page.locator(".mp-window");
  await expect(win).toBeVisible();

  const box = (await win.boundingBox())!;
  const png = await page.screenshot({
    omitBackground: true,
    clip: { x: box.x, y: box.y, width: 24, height: 24 }, // top-left corner, outside the 16px arc at (0,0)
  });

  const alpha = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const ctx = Object.assign(document.createElement("canvas"), { width: bmp.width, height: bmp.height }).getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    return ctx.getImageData(0, 0, 1, 1).data[3];
  }, png.toString("base64"));

  // A painted background rectangle would be opaque (255). T1's window-level ambient shadow (blur, 0.35 alpha peak)
  // legitimately tints this corner faintly (measured 7/255), so allow a small alpha rather than exactly 0.
  expect(alpha, "alpha of pixel (0,0) at the window's rounded corner").toBeLessThanOrEqual(24);
});

test("the saved appearance is applied on launch: theme, layout, overrides, hidden parts, theme effects", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(
    ([key, contract]) =>
      localStorage.setItem(
        key as string,
        JSON.stringify({
          theme: "t5-kinetic",
          variant: { theme: "t5-kinetic", contract, layout: "card", overrides: { "--mp-accent": "#123456" }, hidden: ["album"] },
        }),
      ),
    [APPEARANCE_STORAGE_KEY, CONTRACT_VERSION] as const,
  );
  await page.reload();

  const root = page.locator(".mp-root");
  await expect(root).toHaveAttribute("data-theme", "t5-kinetic");
  await expect(root).toHaveAttribute("data-layout", "card");
  await expect(root).toHaveAttribute("data-hide-album");
  await expect(root).toHaveAttribute("data-fx-title", "splitflap"); // T5's theme.json `fx`, not the variant's
  expect(await root.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--mp-accent"))).toBe("#123456");
});

test("invalid stored appearance falls back to the default theme and is rewritten as valid data", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((key) => localStorage.setItem(key, "{not json"), APPEARANCE_STORAGE_KEY);
  await page.reload();

  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "t1-default");
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), APPEARANCE_STORAGE_KEY);
  expect(stored.theme).toBe("t1-default");
  expect(stored.variant.contract).toBe(CONTRACT_VERSION);
});

// --- Native window (Slice 2). Tauri's IPC is replaced by a recorder, so these check what the bundle *asks*
// the native window to do; whether Tauri then does it is checked by hand in the release exe (DECISIONS.md).
// `theme` = the player's data-theme at the moment of the call (to check what happens before vs after a theme swap).
type IpcCall = { cmd: string; args: Record<string, unknown>; theme: string | null };

// `spotify` / `volume` are what Rust's `spotify_state` / `spotify_volume` answer (null = never published).
async function fakeTauri(page: import("@playwright/test").Page, opts: { spotify?: SpotifyState; volume?: SpotifyVolume } = {}) {
  await page.addInitScript(({ spotify, volume }: { spotify: unknown; volume: unknown }) => {
    const calls: { cmd: string; args: unknown; theme: string | null }[] = [];
    const callbacks = new Map<number, (raw: unknown) => void>();
    let nextCallback = 1;
    let nextRid = 100;
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
      // Deliver a message on a Channel the way Rust does, e.g. a native menu item's action firing.
      __fireChannel: (channel: string, message: unknown) =>
        callbacks.get(Number(channel.replace("__CHANNEL__:", "")))?.({ index: 0, message }),
      // Like Tauri's, `popup` resolves only when the native menu closes; this closes it.
      __closeMenu: () => {
        const close = closeOpenMenu;
        closeOpenMenu = null;
        close?.();
      },
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
        invoke: (cmd: string, args: unknown) => {
          const theme = document.querySelector(".mp-root")?.getAttribute("data-theme") ?? null;
          calls.push({ cmd, args: JSON.parse(JSON.stringify(args ?? {})), theme });
          // Resource-creating commands answer [rid, id]; everything else resolves to nothing.
          if (cmd === "plugin:menu|new") return Promise.resolve([nextRid, `menu-${nextRid++}`]);
          if (cmd === "plugin:menu|popup") return new Promise((resolve) => (closeOpenMenu = () => resolve(null)));
          if (cmd === "spotify_state") return Promise.resolve(spotify);
          if (cmd === "spotify_volume") return Promise.resolve(volume);
          if (cmd.startsWith("spotify_")) return Promise.resolve(true);
          return Promise.resolve(null);
        },
        transformCallback: (cb: (raw: unknown) => void) => {
          callbacks.set(nextCallback, cb);
          return nextCallback++;
        },
        unregisterCallback: (id: number) => callbacks.delete(id),
      },
    });
  }, { spotify: opts.spotify ?? null, volume: opts.volume ?? null });
}

const ipcCalls = (page: import("@playwright/test").Page, cmd: string) =>
  page.evaluate((c) => (window as unknown as { __ipcCalls: IpcCall[] }).__ipcCalls.filter((x) => x.cmd === c), cmd);

test("in Tauri, launch sizes the window to the default theme's declared window (logical px)", async ({ page }) => {
  await fakeTauri(page);
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "t1-default");
  await expect.poll(() => ipcCalls(page, "plugin:window|set_size")).toEqual([
    { cmd: "plugin:window|set_size", args: { label: "main", value: { Logical: { width: 340, height: 600 } } }, theme: "t1-default" },
  ]);
});

test("in Tauri, a saved theme sizes the window to that theme's declared window", async ({ page }) => {
  await fakeTauri(page);
  await page.goto("/");
  await page.evaluate(
    ([key, contract]) =>
      localStorage.setItem(
        key as string,
        JSON.stringify({ theme: "t5-kinetic", variant: { theme: "t5-kinetic", contract, layout: "card", overrides: {}, hidden: [] } }),
      ),
    [APPEARANCE_STORAGE_KEY, CONTRACT_VERSION] as const,
  );
  await page.reload();
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "t5-kinetic");
  await expect
    .poll(async () => (await ipcCalls(page, "plugin:window|set_size")).map((c) => c.args.value))
    .toEqual([{ Logical: { width: 320, height: 490 } }]);
});

test("in Tauri, pressing the player drags the window; controls, right-clicks and outside the player don't", async ({ page }) => {
  await fakeTauri(page);
  await page.goto("/");
  await expect(page.locator(".mp-window")).toBeVisible();
  // The idle player has no controls, so put one of each excluded kind inside it (the rule is by selector).
  await page.evaluate(() => {
    const win = document.querySelector(".mp-window")!;
    for (const html of ['<button id="t-btn">x</button>', '<input id="t-input" type="range">', '<a id="t-link" href="#">x</a>', '<div id="t-nodrag" data-no-drag><span id="t-nodrag-child">x</span></div>'])
      win.insertAdjacentHTML("beforeend", html);
  });
  const press = (sel: string, button = 0) =>
    page.evaluate(([s, b]) => document.querySelector(s as string)!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: b as number })), [sel, button] as const);
  const drags = async () => (await ipcCalls(page, "plugin:window|start_dragging")).length;

  for (const sel of ["#t-btn", "#t-input", "#t-link", "#t-nodrag-child", "body"]) await press(sel);
  await press(".mp-window", 2);
  expect(await drags(), "no drag from controls, [data-no-drag], outside .mp-root, or a right-click").toBe(0);

  await press(".mp-window");
  await press(".mp-empty");
  await expect.poll(drags, "a primary press on the player's own surface starts a drag").toBe(2);
});

// --- Click-through (Slice 3). Rust lets clicks through the window wherever the cursor is outside the boxes the
// bundle reports; these check the reports. The Rust hit test has unit tests; the real window is probed via Win32.
type HitRect = { x: number; y: number; width: number; height: number };
const lastHitRegion = async (page: import("@playwright/test").Page) =>
  ((await ipcCalls(page, "set_hit_region")).at(-1)?.args.rects ?? null) as HitRect[] | null;
const playerBoxes = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    [".mp-root", ".mp-window"].map((s) => {
      const r = document.querySelector(s)!.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );

test("in Tauri, the player's own boxes become the window's hit area, leaving the rest of the window click-through", async ({ page }) => {
  await page.setViewportSize({ width: 340, height: 600 }); // T1's declared window, as in the real app
  await fakeTauri(page);
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "t1-default");
  await expect.poll(() => lastHitRegion(page)).toEqual(await playerBoxes(page));

  // The point of it: the idle card is much smaller than T1's 340x600 window. The margins beside and below it, the
  // Collage bleed and the ambient shadow all sit outside these boxes, so they never block clicks.
  const region = (await lastHitRegion(page))!;
  expect(Math.min(...region.map((r) => r.x))).toBeGreaterThan(0);
  expect(Math.max(...region.map((r) => r.x + r.width))).toBeLessThan(340);
  expect(Math.max(...region.map((r) => r.y + r.height))).toBeLessThan(600);
  const calls = (await ipcCalls(page, "set_hit_region")).length;
  await page.waitForTimeout(300);
  expect((await ipcCalls(page, "set_hit_region")).length, "an unchanged player is not re-reported").toBe(calls);
});

// Production is idle-only until an adapter lands, and idle themes don't grow on hover (T3 reveals controls only
// with a track), so this grows .mp-window directly: the same resize a hover-reveal or theme switch causes.
test("in Tauri, the hit area follows the player when it grows and shrinks back", async ({ page }) => {
  await fakeTauri(page);
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "t1-default");
  await expect.poll(() => lastHitRegion(page)).toEqual(await playerBoxes(page));
  const idle = (await lastHitRegion(page))!;

  await page.locator(".mp-window").evaluate((el) => ((el as HTMLElement).style.paddingBottom = "120px"));
  const grown = await playerBoxes(page);
  expect(grown[1].height).toBeGreaterThan(idle[1].height + 50);
  await expect.poll(() => lastHitRegion(page)).toEqual(grown);

  await page.locator(".mp-window").evaluate((el) => ((el as HTMLElement).style.paddingBottom = ""));
  await expect.poll(() => lastHitRegion(page)).toEqual(idle);

  // A transform switched on instantly (no resize, no transition, as a [data-hover] rule might) is caught by
  // watching the parts' own attributes.
  await page.locator(".mp-window").evaluate((el) => Object.assign((el as HTMLElement).style, { transition: "none", transform: "translateX(30px)" }));
  const moved = await playerBoxes(page);
  expect(moved[1].x).toBeCloseTo(idle[1].x + 30, 0);
  await expect.poll(() => lastHitRegion(page)).toEqual(moved);
});

// --- Theme picker (Slice 4): right-click opens a native menu, created and shown over IPC. Picking an item is
// simulated by firing its action channel, as Rust does when the user clicks it.
const THEME_IDS = ["t1-default", "t2-artwork", "t3-pill", "t4-extreme", "t5-kinetic"]; // registry order
const themeJson = (id: string) =>
  JSON.parse(readFileSync(new URL(`../themes/${id}/theme.json`, import.meta.url), "utf8")) as {
    name: string;
    window: { width: number; height: number };
  };
type MenuItemArg = { text: string; checked: boolean; handler: string };
const lastMenuItems = async (page: import("@playwright/test").Page) =>
  ((await ipcCalls(page, "plugin:menu|new")).at(-1)?.args.options as { items: MenuItemArg[] } | undefined)?.items;
async function openThemeMenu(page: import("@playwright/test").Page) {
  const before = (await ipcCalls(page, "plugin:menu|popup")).length;
  const box = (await page.locator(".mp-window").boundingBox())!;
  await page.mouse.click(box.x + 20, box.y + 20, { button: "right" });
  await expect.poll(async () => (await ipcCalls(page, "plugin:menu|popup")).length).toBe(before + 1);
  return lastMenuItems(page);
}
const closeMenu = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __closeMenu: () => void }).__closeMenu());
async function pickTheme(page: import("@playwright/test").Page, id: string) {
  const items = (await openThemeMenu(page))!;
  const item = items.find((i) => i.text === themeJson(id).name)!;
  await page.evaluate(([h]) => (window as unknown as { __fireChannel: (c: string, m: unknown) => void }).__fireChannel(h, "item"), [item.handler]);
  await closeMenu(page); // clicking an item closes the native menu
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", id);
}

// Regression (found in the real exe): Tauri's `popup` holds the webview's resource table until the menu closes, and
// `new`/`close` need it on the main thread, so sending either while a menu is open deadlocks the app.
test("in Tauri, nothing touches menu resources while a menu is open, and the old menu is closed before the next is made", async ({ page }) => {
  await fakeTauri(page);
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "t1-default");
  const cmds = () => page.evaluate(() => (window as unknown as { __ipcCalls: IpcCall[] }).__ipcCalls.map((c) => c.cmd).filter((c) => /menu\||resources\|/.test(c)));

  await openThemeMenu(page); // menu 1 is open: its popup has not returned
  const box = (await page.locator(".mp-window").boundingBox())!;
  await page.mouse.click(box.x + 30, box.y + 30, { button: "right" });
  await page.keyboard.press("Shift+F10");
  await page.waitForTimeout(200);
  expect(await cmds(), "extra requests while a menu is open are dropped").toEqual(["plugin:menu|new", "plugin:menu|popup"]);

  await closeMenu(page);
  await openThemeMenu(page);
  expect(await cmds(), "close (awaited) -> new -> popup, never interleaved").toEqual([
    "plugin:menu|new",
    "plugin:menu|popup",
    "plugin:resources|close",
    "plugin:menu|new",
    "plugin:menu|popup",
  ]);
  expect((await ipcCalls(page, "plugin:resources|close"))[0].args.rid).toBe(100);
});

test("in Tauri, right-click opens a native menu of every theme by name, the active one checked, at the click point", async ({ page }) => {
  await fakeTauri(page);
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "t1-default");
  await page.evaluate(() => window.addEventListener("contextmenu", (e) => ((window as unknown as { __prevented: boolean }).__prevented = e.defaultPrevented)));

  const items = (await openThemeMenu(page))!;
  expect(items.map((i) => i.text)).toEqual(THEME_IDS.map((id) => themeJson(id).name));
  expect(items.map((i) => i.checked)).toEqual([true, false, false, false, false]);
  expect(items.map((i) => i.text)).not.toContain("[NEEDS COPY]");
  const box = (await page.locator(".mp-window").boundingBox())!;
  expect((await ipcCalls(page, "plugin:menu|popup")).at(-1)!.args.at).toEqual({ Logical: { x: box.x + 20, y: box.y + 20 } });
  expect(await page.evaluate(() => (window as unknown as { __prevented: boolean }).__prevented), "the webview's own menu is suppressed").toBe(true);
});

test("in Tauri, picking a theme switches it, clears the old overrides, saves it and resizes the window (growing first)", async ({ page }) => {
  await fakeTauri(page);
  await page.goto("/");
  await page.evaluate(
    ([key, contract]) =>
      localStorage.setItem(
        key as string,
        JSON.stringify({ theme: "t1-default", variant: { theme: "t1-default", contract, layout: "card", overrides: { "--mp-accent": "#123456" }, hidden: ["album"] } }),
      ),
    [APPEARANCE_STORAGE_KEY, CONTRACT_VERSION] as const,
  );
  await page.reload();
  const root = page.locator(".mp-root");
  await expect(root).toHaveAttribute("data-hide-album");
  const sizesFrom = async (n: number) =>
    (await ipcCalls(page, "plugin:window|set_size")).slice(n).map((c) => ({ size: c.args.value, during: c.theme }));
  await expect.poll(async () => (await ipcCalls(page, "plugin:window|set_size")).length).toBe(1);

  // Smaller theme: no pre-grow, one exact resize once the new theme is on screen.
  let n = (await ipcCalls(page, "plugin:window|set_size")).length;
  await pickTheme(page, "t3-pill");
  await expect(root).toHaveAttribute("data-layout", "pill");
  await expect(root).not.toHaveAttribute("data-hide-album");
  expect(await root.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--mp-accent"))).toBe("");
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), APPEARANCE_STORAGE_KEY);
  expect(stored).toMatchObject({ theme: "t3-pill", variant: { theme: "t3-pill", layout: "pill", overrides: {}, hidden: [] } });
  await expect.poll(() => sizesFrom(n)).toEqual([{ size: { Logical: { width: 248, height: 86 } }, during: "t3-pill" }]);

  // The menu now checks the new theme, and the previous menu resource was released.
  const items = (await openThemeMenu(page))!;
  expect(items.filter((i) => i.checked).map((i) => i.text)).toEqual([themeJson("t3-pill").name]);
  expect((await ipcCalls(page, "plugin:resources|close")).map((c) => c.args.rid)).toEqual([100]); // the fake's first rid
  await closeMenu(page); // dismissed without a pick

  // T5 (320x490) -> T4 (282x529): neither contains the other, so the window first grows to 320x529 while T5 is
  // still showing, then takes T4's exact size after T4 renders. Neither theme is ever clipped.
  await pickTheme(page, "t5-kinetic");
  n = (await ipcCalls(page, "plugin:window|set_size")).length;
  await pickTheme(page, "t4-extreme");
  await expect.poll(() => sizesFrom(n)).toEqual([
    { size: { Logical: { width: 320, height: 529 } }, during: "t5-kinetic" },
    { size: { Logical: { width: 282, height: 529 } }, during: "t4-extreme" },
  ]);
});

test("in Tauri, 20 theme swaps through the menu: every swap lands, no errors, at most one live menu", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await fakeTauri(page);
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "t1-default");
  for (let i = 1; i <= 20; i++) await pickTheme(page, THEME_IDS[i % THEME_IDS.length]);
  const live = (await ipcCalls(page, "plugin:menu|new")).length - (await ipcCalls(page, "plugin:resources|close")).length;
  expect(live).toBe(1);
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", THEME_IDS[20 % THEME_IDS.length]);
  expect(errors).toEqual([]);
});

// --- Placement (Slice 6): in its declared window the player is centred side to side and pinned to the top. Widths
// never change with state, heights do (T1 244-572 px), so vertical centring would make the card jump.
for (const id of THEME_IDS) {
  test(`in its real window size, ${id}'s player is centred horizontally and pinned to the top`, async ({ page }) => {
    const { window: size, layout } = JSON.parse(readFileSync(new URL(`../themes/${id}/theme.json`, import.meta.url), "utf8")) as {
      window: { width: number; height: number };
      layout: string;
    };
    await page.setViewportSize(size);
    await page.goto("/");
    await page.evaluate(
      ([key, contract, theme, lay]) =>
        localStorage.setItem(key as string, JSON.stringify({ theme, variant: { theme, contract, layout: lay, overrides: {}, hidden: [] } })),
      [APPEARANCE_STORAGE_KEY, CONTRACT_VERSION, id, layout] as const,
    );
    await page.reload();
    await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", id);
    const box = (await page.locator(".mp-window").boundingBox())!;
    expect(box.y, "top edge pinned").toBe(0);
    expect(Math.abs(box.x - (size.width - box.width) / 2), "equal margin left and right").toBeLessThanOrEqual(0.5);

    if (id === "t1-default") {
      // The Collage layer (.mp-root::before/::after, 300 px wide) bleeds 96 px past each card edge; the window has
      // 30 px to spare on each side, so both overflow the window by the same amount (it used to be 96 left, 36 right).
      const overflow = await page.evaluate((vw) => {
        const root = document.querySelector(".mp-root")!;
        const x = root.getBoundingClientRect().x;
        const edge = (p: string) => {
          const cs = getComputedStyle(root, p);
          return { left: x + parseFloat(cs.left), right: x + parseFloat(cs.left) + parseFloat(cs.width) };
        };
        return { left: -edge("::before").left, right: edge("::after").right - vw };
      }, size.width);
      expect(Math.abs(overflow.left - overflow.right), JSON.stringify(overflow)).toBeLessThanOrEqual(1);
    }
  });
}

// --- Real playback (M1 R1): the bundle follows Rust's Spotify state (src-tauri/src/spotify). GSMTC itself is checked
// in the real exe; these check what the bundle does with the states and events Rust sends. Track text is fixture data.
const TYPICAL = fixtures["typical / all caps"].track!;
const OTHER = fixtures["CJK / accented characters"].track!;
const ARTWORK = fixtures["colorful artwork (filter test)"].track!.artwork!;
function spotifyState(over: Partial<SpotifyState> = {}): SpotifyState {
  return {
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
    positionUpdatedAt: Date.now(),
    canSeek: true,
    ...over,
  };
}
const emitSpotify = (page: import("@playwright/test").Page, state: SpotifyState) =>
  page.evaluate((s) => (window as unknown as { __emit: (e: string, p: unknown) => void }).__emit("spotify:state", s), state);
const ipcCmds = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    (window as unknown as { __ipcCalls: IpcCall[] }).__ipcCalls.map((c) =>
      c.cmd === "plugin:event|listen" ? `listen ${(c.args as { event: string }).event}` : c.cmd,
    ),
  );

test("in Tauri, the player listens for Spotify's state, then pulls it, and shows the track with its artwork", async ({ page }) => {
  await fakeTauri(page, { spotify: spotifyState() });
  await page.goto("/");
  const root = page.locator(".mp-root");
  await expect(root).toHaveAttribute("data-status", "playing");
  await expect(root).toHaveAttribute("data-source", "spotify");
  await expect(root).toHaveAttribute("data-cap-seek", "true");
  await expect(page.locator(".mp-title")).toContainText(TYPICAL.title);
  await expect(page.locator(".mp-artist")).toContainText(TYPICAL.artist);
  await expect(page.locator(".mp-album")).toContainText(TYPICAL.album!);
  await expect(page.locator("img.mp-artwork")).toHaveAttribute("src", ARTWORK);
  await expect(page.locator(".mp-time-total")).toHaveText("3:30");

  // Listening first means no change can fall between the pull and the subscription.
  const cmds = await ipcCmds(page);
  expect(cmds).toContain("listen spotify:state");
  expect(cmds.indexOf("listen spotify:state")).toBeLessThan(cmds.indexOf("spotify_state"));
});

test("in Tauri, Spotify events update the player; older ones are ignored; artwork survives events that omit it", async ({ page }) => {
  await fakeTauri(page, { spotify: spotifyState({ seq: 3 }) });
  await page.goto("/");
  const root = page.locator(".mp-root");
  await expect(root).toHaveAttribute("data-status", "playing");

  await emitSpotify(page, spotifyState({ seq: 4, status: "paused", artwork: null })); // same image, not resent
  await expect(root).toHaveAttribute("data-status", "paused");
  await expect(page.locator("img.mp-artwork")).toHaveAttribute("src", ARTWORK);

  await emitSpotify(page, spotifyState({ seq: 2, status: "playing" })); // older than what is showing
  await page.waitForTimeout(150);
  await expect(root).toHaveAttribute("data-status", "paused");

  await emitSpotify(page, spotifyState({ seq: 5, title: OTHER.title, artist: OTHER.artist, artworkId: 0, artwork: null }));
  await expect(page.locator(".mp-title")).toContainText(OTHER.title);
  await expect(page.locator(".mp-artwork")).toHaveCount(1);
  await expect(page.locator("img.mp-artwork"), "a track without artwork shows the placeholder, not the old image").toHaveCount(0);

  await emitSpotify(page, spotifyState({ seq: 6, session: false })); // Spotify closed
  await expect(root).toHaveAttribute("data-status", "unavailable");
  await expect(page.locator(".mp-empty")).toBeVisible();

  await emitSpotify(page, spotifyState({ seq: 7 })); // ...and reopened
  await expect(root).toHaveAttribute("data-status", "playing");
  await expect(page.locator(".mp-title")).toContainText(TYPICAL.title);
});

test("in Tauri, Spotify not running shows the unavailable state: the empty-state part with its own copy, and the badge", async ({ page }) => {
  await fakeTauri(page, { spotify: spotifyState({ session: false, title: "", artist: "", album: "", artworkId: 0, artwork: null }) });
  await page.goto("/");
  const root = page.locator(".mp-root");
  await expect(root).toHaveAttribute("data-status", "unavailable");
  // COPY.md's "Spotify not running" is still [NEEDS COPY], and that is what must show (never invented text).
  await expect(page.locator(".mp-empty")).toHaveText("[NEEDS COPY]");
  await expect(page.locator(".mp-source-badge")).toBeVisible();
  await expect(page.locator(".mp-controls, .mp-artwork, .mp-title")).toHaveCount(0);
});

// --- Paused pulse: an endless play-icon pulse kept the real window at ~20% of a CPU core while paused (DECISIONS.md
// M1 R2), so it pulses 3 times per pause and then nothing on the page animates.
test("paused, the play icon pulses 3 times and then nothing animates; every new pause pulses again", async ({ page }) => {
  await fakeTauri(page, { spotify: spotifyState({ status: "paused", artwork: null, artworkId: 0 }) });
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-status", "paused");
  const pulse = () =>
    page.evaluate(() =>
      document
        .querySelector(".mp-btn-play svg")!
        .getAnimations()
        .map((a) => ({ name: (a as CSSAnimation).animationName, iterations: a.effect!.getComputedTiming().iterations, state: a.playState })),
    );
  expect(await pulse()).toContainEqual({ name: "mp-icon-idle", iterations: 3, state: "running" });
  const running = () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
  await expect.poll(running, { timeout: 10_000, message: "3 × 2.4 s, then nothing running" }).toBe(0);

  await emitSpotify(page, spotifyState({ seq: 4, status: "playing", artwork: null, artworkId: 0 }));
  await emitSpotify(page, spotifyState({ seq: 5, status: "paused", artwork: null, artworkId: 0 }));
  await expect.poll(pulse).toContainEqual({ name: "mp-icon-idle", iterations: 3, state: "running" });
});

// --- CPU pass (2026-10-17): in the real transparent window a smooth endless animation costs ~10–20% of a core and
// a low-rate stepped one about nothing. Every theme, with its own default effects and a playing track.
for (const id of THEME_IDS) {
  test(`${id}: every endless animation is stepped, and no progress fill animates its width`, async ({ page }) => {
    await fakeTauri(page, { spotify: spotifyState() });
    await page.addInitScript(
      ([key, contract, theme, layout]) =>
        localStorage.setItem(key, JSON.stringify({ theme, variant: { theme, contract, layout, overrides: {}, hidden: [] } })),
      [APPEARANCE_STORAGE_KEY, CONTRACT_VERSION, id, id === "t3-pill" ? "pill" : "card"] as const,
    );
    await page.goto("/");
    await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", id);
    await expect(page.locator(".mp-root")).toHaveAttribute("data-status", "playing");
    await page.waitForTimeout(1000); // entrance animations finish; endless ones keep running
    const endless = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.effect!.getComputedTiming().iterations === Infinity)
        .map((a) => {
          const effect = a.effect as KeyframeEffect;
          const easing = getComputedStyle(effect.target!, effect.pseudoElement).animationTimingFunction;
          return `${(a as CSSAnimation).animationName}${effect.pseudoElement ?? ""} ${easing}`;
        }),
    );
    for (const a of endless) expect(a, "endless animations must be stepped").toMatch(/ steps\(/);
    if (id === "t4-extreme") expect(endless.some((a) => a.startsWith("mp-t4-marquee"))).toBe(true);
    if (id === "t5-kinetic") expect(endless.filter((a) => a.startsWith("t5-spin"))).toHaveLength(2);

    const fill = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector(".mp-progress-fill")!);
      return { property: cs.transitionProperty, duration: cs.transitionDuration };
    });
    const widthAnimated = fill.property.split(",").some((p, i) => /^(all|width)$/.test(p.trim()) && parseFloat(fill.duration.split(",")[i] ?? fill.duration) > 0);
    expect(widthAnimated, `${id} progress fill transition: ${JSON.stringify(fill)}`).toBe(false);
  });
}

test("while playing, the player re-renders about once a second (the position tick), on the second", async ({ page }) => {
  await fakeTauri(page, { spotify: spotifyState({ positionMs: 10_400, positionUpdatedAt: Date.now() }) });
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-status", "playing");
  await page.waitForTimeout(1200);
  const changes = await page.evaluate(
    () =>
      new Promise<{ styleWrites: number; labels: string[] }>((resolve) => {
        let styleWrites = 0;
        const labels: string[] = [];
        const root = document.querySelector(".mp-root")!;
        const time = document.querySelector(".mp-time-current")!;
        const mo = new MutationObserver((m) => (styleWrites += m.filter((r) => r.attributeName === "style").length));
        mo.observe(root, { attributes: true });
        const to = new MutationObserver(() => labels.push(time.textContent ?? ""));
        to.observe(time, { childList: true, characterData: true, subtree: true });
        setTimeout(() => (mo.disconnect(), to.disconnect(), resolve({ styleWrites, labels })), 4000);
      }),
  );
  // 4 s at one tick a second: 4 (±1 for where the window starts). The old 250 ms tick gave 16.
  expect(changes.styleWrites).toBeGreaterThanOrEqual(3);
  expect(changes.styleWrites).toBeLessThanOrEqual(5);
  // Every tick moves the m:ss label on by exactly one second.
  const secs = changes.labels.map((l) => Number(l.split(":")[0]) * 60 + Number(l.split(":")[1]));
  for (let i = 1; i < secs.length; i++) expect(secs[i] - secs[i - 1]).toBe(1);
});

// --- The lyrics button (S6, contract v6): brings Spotify's own window forward through `spotify_show_window`.
test("in Tauri, the lyrics button sits after next, asks Rust to bring Spotify forward, and never drags the window", async ({ page }) => {
  await fakeTauri(page, { spotify: spotifyState() });
  await page.goto("/");
  const root = page.locator(".mp-root");
  await expect(root).toHaveAttribute("data-cap-lyrics", "true");
  const order = await page.locator(".mp-controls > button").evaluateAll((els) => els.map((e) => e.className));
  expect(order).toEqual(["mp-btn-prev", "mp-btn-play", "mp-btn-next", "mp-btn-lyrics"]);
  // Its name comes from COPY.md.
  await expect(page.locator(".mp-btn-lyrics")).toHaveAttribute("aria-label", "Lyrics");

  await page.locator(".mp-btn-lyrics").click();
  await expect.poll(async () => (await ipcCalls(page, "spotify_show_window")).length).toBe(1);
  expect(await ipcCalls(page, "plugin:window|start_dragging")).toEqual([]);

  // Spotify not running: no track, so no controls and no lyrics button.
  await emitSpotify(page, spotifyState({ seq: 4, session: false }));
  await expect(root).not.toHaveAttribute("data-cap-lyrics", /.*/);
  await expect(page.locator(".mp-btn-lyrics")).toHaveCount(0);
});

// --- Spotify's own volume (S5, M1 R3): Core Audio's per-app level, through `spotify_volume` / `spotify:volume`.
const emitVolume = (page: import("@playwright/test").Page, volume: SpotifyVolume) =>
  page.evaluate((v) => (window as unknown as { __emit: (e: string, p: unknown) => void }).__emit("spotify:volume", v), volume);
const volumeSets = async (page: import("@playwright/test").Page) => (await ipcCalls(page, "spotify_set_volume")).map((c) => c.args.level as number);

test("in Tauri, Spotify's volume shows on the slider and turns the volume capability on", async ({ page }) => {
  await fakeTauri(page, { spotify: spotifyState(), volume: { available: true, level: 0.37 } });
  await page.goto("/");
  const root = page.locator(".mp-root");
  await expect(root).toHaveAttribute("data-cap-volume", "true");
  await expect(page.locator(".mp-volume")).toHaveValue("0.37");

  // A change made in the Windows mixer arrives as an event.
  await emitVolume(page, { available: true, level: 0.81 });
  await expect(page.locator(".mp-volume")).toHaveValue("0.81");

  // Spotify's audio session gone (or never created): no capability, no slider.
  await emitVolume(page, { available: false, level: 0 });
  await expect(root).not.toHaveAttribute("data-cap-volume", /.*/);
  await expect(page.locator(".mp-volume")).toHaveCount(0);
});

test("in Tauri, moving the slider sets Spotify's volume; reports during a drag don't pull the slider back", async ({ page }) => {
  await fakeTauri(page, { spotify: spotifyState(), volume: { available: true, level: 0.5 } });
  await page.goto("/");
  const slider = page.locator(".mp-volume");
  await expect(slider).toHaveValue("0.5");

  await slider.fill("0.2");
  await expect.poll(() => volumeSets(page)).toEqual([0.2]);
  await expect(slider).toHaveValue("0.2");
  // Rust reports an older level while the hold is on: the slider stays where the user put it...
  await emitVolume(page, { available: true, level: 0.5 });
  await page.waitForTimeout(100);
  await expect(slider).toHaveValue("0.2");
  // ...and the newest report applies once the hold ends.
  await emitVolume(page, { available: true, level: 0.21 });
  await expect(slider).toHaveValue("0.21", { timeout: 2000 });

  // Several quick moves: every value reaches Rust in order, the last one last.
  for (const v of ["0.3", "0.4", "0.6"]) await slider.fill(v);
  await expect.poll(async () => (await volumeSets(page)).at(-1)).toBe(0.6);
  const sets = await volumeSets(page);
  expect([...sets].sort((a, b) => a - b).slice(-1)[0]).toBe(0.6);
});

test("in Tauri, no volume yet (Spotify hasn't played since it started) shows no slider", async ({ page }) => {
  await fakeTauri(page, { spotify: spotifyState() });
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-status", "playing");
  await expect(page.locator(".mp-root")).not.toHaveAttribute("data-cap-volume", /.*/);
  await expect(page.locator(".mp-volume")).toHaveCount(0);
});

// --- Keyboard seek (M1 R2): ←/→ move 5 s while the window has focus; no visible seek control (contract "Not in v1").
const seekCalls = async (page: import("@playwright/test").Page) =>
  (await ipcCalls(page, "spotify_seek")).map((c) => c.args.positionMs as number);

test("in Tauri, → and ← seek 5 s from the live position, shown at once, and quick presses build on each other", async ({ page }) => {
  await fakeTauri(page, { spotify: spotifyState({ status: "paused", positionMs: 42_000 }) });
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-status", "paused");
  const time = page.locator(".mp-time-current");
  await expect(time).toHaveText("0:42");

  await page.keyboard.press("ArrowRight");
  await expect.poll(() => seekCalls(page)).toEqual([47_000]);
  await expect(time, "optimistic: before Spotify confirms").toHaveText("0:47");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => seekCalls(page)).toEqual([47_000, 52_000]);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => seekCalls(page)).toEqual([47_000, 52_000, 47_000]);
  await expect(time).toHaveText("0:47");

  // Spotify's own report wins over the optimistic value.
  await emitSpotify(page, spotifyState({ seq: 4, status: "paused", positionMs: 46_500, artwork: null }));
  await expect(time).toHaveText("0:46");
});

test("in Tauri, seeking stops at the track's start and end, and plays from the interpolated position", async ({ page }) => {
  await fakeTauri(page, { spotify: spotifyState({ status: "paused", positionMs: 2_000 }) });
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-status", "paused");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => seekCalls(page)).toEqual([0]);

  const end = TYPICAL.durationMs!;
  await emitSpotify(page, spotifyState({ seq: 4, status: "paused", positionMs: end - 1_000, artwork: null }));
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => seekCalls(page)).toEqual([0, end]);

  // Playing: the step is taken from where the track is now, not from Spotify's last report.
  const now = await page.evaluate(() => Date.now());
  await emitSpotify(page, spotifyState({ seq: 5, positionMs: 10_000, positionUpdatedAt: now - 3_000, artwork: null }));
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await seekCalls(page)).length).toBe(3);
  const target = (await seekCalls(page))[2];
  expect(target).toBeGreaterThanOrEqual(18_000);
  expect(target).toBeLessThan(19_500);
});

test("in Tauri, arrows don't seek with a modifier, inside a field, without the seek capability, or with nothing playing", async ({ page }) => {
  await fakeTauri(page, { spotify: spotifyState({ status: "paused" }) });
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-status", "paused");
  await page.keyboard.press("Control+ArrowRight");
  await page.keyboard.press("Alt+ArrowLeft");
  await page.keyboard.press("ArrowUp");
  // A field that uses arrows itself (the volume slider is one; Spotify has none yet, so add one).
  await page.evaluate(() => document.querySelector(".mp-window")!.insertAdjacentHTML("beforeend", '<input id="t-range" type="range">'));
  await page.locator("#t-range").focus();
  await page.keyboard.press("ArrowRight");
  await page.locator("#t-range").blur();

  await emitSpotify(page, spotifyState({ seq: 4, status: "paused", canSeek: false, artwork: null }));
  await expect(page.locator(".mp-root")).not.toHaveAttribute("data-cap-seek", /.*/);
  await page.keyboard.press("ArrowRight");
  await emitSpotify(page, spotifyState({ seq: 5, session: false }));
  await expect(page.locator(".mp-root")).toHaveAttribute("data-status", "unavailable");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(150);
  expect(await seekCalls(page)).toEqual([]);
});

test("in Tauri, the transport buttons send Spotify's commands and never start a window drag", async ({ page }) => {
  await fakeTauri(page, { spotify: spotifyState() });
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-status", "playing");
  await page.locator(".mp-btn-play").click();
  await page.locator(".mp-btn-next").click();
  await page.locator(".mp-btn-prev").click();
  await expect
    .poll(async () => (await ipcCmds(page)).filter((c) => c.startsWith("spotify_") && c !== "spotify_state" && c !== "spotify_volume"))
    .toEqual(["spotify_play_pause", "spotify_next", "spotify_previous"]);
  expect(await ipcCalls(page, "plugin:window|start_dragging")).toEqual([]);
});

test("in Tauri, a playing track's time advances between Spotify updates (C10); a paused one holds still", async ({ page }) => {
  await fakeTauri(page, { spotify: spotifyState({ positionMs: 10_000, positionUpdatedAt: Date.now() }) });
  await page.goto("/");
  const time = page.locator(".mp-time-current");
  await expect.poll(() => time.textContent(), { timeout: 6000 }).toMatch(/^0:1[2-9]$/);

  const now = await page.evaluate(() => Date.now());
  await emitSpotify(page, spotifyState({ seq: 4, status: "paused", positionMs: 30_000, positionUpdatedAt: now - 60_000 }));
  await expect(time).toHaveText("0:30");
  await page.waitForTimeout(1200);
  await expect(time).toHaveText("0:30");
});

test("in Tauri, no Spotify state yet (the worker never published) shows idle without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await fakeTauri(page);
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-status", "idle");
  await expect.poll(async () => (await ipcCmds(page)).includes("spotify_state")).toBe(true);
  expect(errors).toEqual([]);
});

// --- Content security policy (Slice 5). Tauri sends tauri.conf.json's CSP as a header in release builds only (S4: not
// in `tauri dev`), so this serves the production bundle with that same header and fails on anything it blocks.
const CSP = (JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8")) as { app: { security: { csp: string } } }).app
  .security.csp;

/** Serves the bundle with the shipped CSP header; returns a reader of the violations seen so far. */
async function serveWithCsp(page: import("@playwright/test").Page) {
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
    window.addEventListener("securitypolicyviolation", (e) => seen.push(`${e.violatedDirective} ${e.blockedURI}`), true);
  });
  return () => page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);
}

test("under the shipped CSP, a Spotify track (data: artwork, palette extraction, T5's effects, a track change) loads nothing blocked", async ({ page }) => {
  await fakeTauri(page, { spotify: spotifyState() });
  const violations = await serveWithCsp(page);
  await page.addInitScript(
    ([key, contract]) =>
      localStorage.setItem(
        key as string,
        JSON.stringify({ theme: "t5-kinetic", variant: { theme: "t5-kinetic", contract, layout: "card", overrides: {}, hidden: [] } }),
      ),
    [APPEARANCE_STORAGE_KEY, CONTRACT_VERSION] as const,
  );
  await page.goto("/");
  const root = page.locator(".mp-root");
  await expect(root).toHaveAttribute("data-theme", "t5-kinetic");
  await expect(root).toHaveAttribute("data-status", "playing");
  // The palette comes from drawing the data: artwork on a canvas.
  await expect.poll(() => root.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--mp-art-1"))).not.toBe("");

  // A track change runs T5's morph and debris (which lazy-loads Matter.js) with a new data: image.
  const dark = fixtures["very dark artwork"].track!.artwork!;
  await emitSpotify(page, spotifyState({ seq: 4, title: OTHER.title, artist: OTHER.artist, artworkId: 2, artwork: dark }));
  await expect(page.locator("img.mp-artwork")).toHaveAttribute("src", dark);
  const matterLoaded = () => page.evaluate(() => performance.getEntriesByType("resource").some((e) => /matter/i.test(e.name)));
  await expect.poll(matterLoaded, { timeout: 5000 }).toBe(true);
  await page.waitForTimeout(300);
  expect(await violations()).toEqual([]);
});

test("the production bundle runs under the shipped CSP: nothing it loads is blocked, in any theme; a remote image is", async ({ page }) => {
  await fakeTauri(page);
  const violations = await serveWithCsp(page);

  const response = await page.goto("/");
  expect(response!.headers()["content-security-policy"]).toBe(CSP);
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "t1-default");
  for (const id of [...THEME_IDS.slice(1), "t1-default"]) await pickTheme(page, id);
  await page.waitForTimeout(300);
  expect(await violations(), "the app's own scripts, styles, filters (incl. the data: dither tile) and IPC").toEqual([]);

  // Canary: proves the policy is really being enforced here, so the empty list above means something.
  await page.evaluate(() => document.body.append(Object.assign(new Image(), { src: "https://example.invalid/canary.png" })));
  await expect.poll(violations).toEqual([expect.stringMatching(/^img-src https:\/\/example\.invalid\/canary\.png$/)]);
});

test("outside Tauri (plain browser) right-click keeps the browser's own menu and opens nothing", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.addEventListener("contextmenu", (e) => ((window as unknown as { __prevented: boolean }).__prevented = e.defaultPrevented)));
  await page.locator(".mp-window").click({ button: "right" });
  expect(await page.evaluate(() => (window as unknown as { __prevented: boolean }).__prevented)).toBe(false);
});

test("outside Tauri (plain browser) the window code is inert: no errors on load or press", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/");
  await page.locator(".mp-window").dispatchEvent("mousedown", { button: 0 });
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "t1-default");
  expect(errors).toEqual([]);
});

test("html, body and #root have no background", async ({ page }) => {
  await page.goto("/");
  const bgs = await page.evaluate(() =>
    ["html", "body", "#root"].map((s) => [s, getComputedStyle(document.querySelector(s)!).backgroundColor]),
  );
  for (const [sel, bg] of bgs) expect(bg, sel).toBe("rgba(0, 0, 0, 0)");
});
