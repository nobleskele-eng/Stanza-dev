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

test("html, body and #root have no background", async ({ page }) => {
  await page.goto("/");
  const bgs = await page.evaluate(() =>
    ["html", "body", "#root"].map((s) => [s, getComputedStyle(document.querySelector(s)!).backgroundColor]),
  );
  for (const [sel, bg] of bgs) expect(bg, sel).toBe("rgba(0, 0, 0, 0)");
});
