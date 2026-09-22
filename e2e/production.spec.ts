import { expect, test } from "@playwright/test";

// The production bundle (no DEV harness) rendered in a page whose background is omitted.
// The real window is transparent (S1 / PLAN.md D11), so anything the page paints behind
// the rounded player shows up as a visible rectangle at the corners.
test.use({ baseURL: "http://localhost:4173" });

test("nothing is painted behind the rounded player: corner pixel is fully transparent", async ({ page }) => {
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

  expect(alpha, "alpha of pixel (0,0) at the window's rounded corner").toBe(0);
});

test("html, body and #root have no background", async ({ page }) => {
  await page.goto("/");
  const bgs = await page.evaluate(() =>
    ["html", "body", "#root"].map((s) => [s, getComputedStyle(document.querySelector(s)!).backgroundColor]),
  );
  for (const [sel, bg] of bgs) expect(bg, sel).toBe("rgba(0, 0, 0, 0)");
});
