import { expect, test } from "@playwright/test";
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
type IpcCall = { cmd: string; args: Record<string, unknown> };

async function fakeTauri(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const calls: { cmd: string; args: unknown }[] = [];
    Object.assign(window, {
      isTauri: true,
      __ipcCalls: calls,
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
        invoke: (cmd: string, args: unknown) => {
          calls.push({ cmd, args: JSON.parse(JSON.stringify(args ?? {})) });
          return Promise.resolve(null);
        },
        transformCallback: () => 0,
      },
    });
  });
}

const ipcCalls = (page: import("@playwright/test").Page, cmd: string) =>
  page.evaluate((c) => (window as unknown as { __ipcCalls: IpcCall[] }).__ipcCalls.filter((x) => x.cmd === c), cmd);

test("in Tauri, launch sizes the window to the default theme's declared window (logical px)", async ({ page }) => {
  await fakeTauri(page);
  await page.goto("/");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-theme", "t1-default");
  await expect.poll(() => ipcCalls(page, "plugin:window|set_size")).toEqual([
    { cmd: "plugin:window|set_size", args: { label: "main", value: { Logical: { width: 340, height: 600 } } } },
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
