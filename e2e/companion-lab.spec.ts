import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { REQUIRED_ANIMATIONS, type Skin } from "../src/companion/skin";

// Read like the theme specs read theme.json (Playwright's loader won't import JSON without an import attribute).
const SKINS: Record<string, Skin> = {
  "test-dummy": JSON.parse(readFileSync(new URL("../companions/test-dummy/companion.json", import.meta.url), "utf8")),
};

// The dev-only Companion lab (PLAN.md §5 M2 C1). Frames must come from JS timers: in the real transparent
// window any running CSS/WAAPI animation costs ~2% of a core (C0 spike, docs/DECISIONS.md 2026-10-17).

const sprite = (anim: string, backdrop = "light", palette = "default", skin = "test-dummy") =>
  `[data-lab-skin="${skin}"][data-lab-palette="${palette}"] [data-lab-anim="${anim}"][data-lab-backdrop="${backdrop}"] [data-lab-sprite] svg`;
const pathsOf = (page: Page, selector: string) =>
  page.evaluate((s) => [...document.querySelector(s)!.querySelectorAll("path")].map((p) => p.getAttribute("d")).join("|"), selector);

test("every skin × palette × animation renders, with no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/?lab=companion");
  await page.locator(sprite("idle")).waitFor();
  for (const skin of Object.values(SKINS))
    for (const palette of Object.keys(skin.palettes))
      for (const anim of REQUIRED_ANIMATIONS)
        for (const backdrop of ["light", "dark"])
          expect(await page.locator(sprite(anim, backdrop, palette, skin.id)).locator("path").count(), `${skin.id}/${palette}/${anim}/${backdrop}`).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("frames advance from JS timers, and nothing on the page is a running CSS/WAAPI animation", async ({ page }) => {
  await page.goto("/?lab=companion");
  const walk = sprite("walk");
  await page.locator(walk).waitFor();
  const first = await pathsOf(page, walk);
  await expect.poll(() => pathsOf(page, walk), { timeout: 2000 }).not.toBe(first);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test("a non-looping animation stops on its last frame; ?pause holds every animation on its first", async ({ page }) => {
  await page.goto("/?lab=companion");
  const wake = sprite("wake");
  await page.locator(wake).waitFor();
  await page.waitForTimeout(1500); // wake: 3 frames at 4 fps, then it stops
  const settled = await pathsOf(page, wake);
  await page.waitForTimeout(800);
  expect(await pathsOf(page, wake)).toBe(settled);

  await page.goto("/?lab=companion&pause");
  await page.locator(sprite("walk")).waitFor();
  const before = await pathsOf(page, sprite("walk"));
  await page.waitForTimeout(1000);
  expect(await pathsOf(page, sprite("walk"))).toBe(before);
});

/** Colour runs (device px) of a PNG and the distinct colours in it. */
async function analyse(page: Page, png: Buffer) {
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const ctx = Object.assign(document.createElement("canvas"), { width: bmp.width, height: bmp.height }).getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, bmp.width, bmp.height);
    const key = (i: number) => `${data[i]},${data[i + 1]},${data[i + 2]}`;
    const colours = new Set<string>();
    const runs: number[] = [];
    for (let y = 0; y < height; y++) {
      let run = 1;
      for (let x = 1; x <= width; x++) {
        colours.add(key((y * width + x - 1) * 4));
        if (x < width && key((y * width + x) * 4) === key((y * width + x - 1) * 4)) run++;
        else {
          runs.push(run);
          run = 1;
        }
      }
    }
    return { width, colours: [...colours], runs };
  }, png.toString("base64"));
}
const rgb = (hex: string) => `${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)}`;

for (const dpr of [1, 1.25, 1.5, 2]) {
  test.describe(`at ${dpr * 100}% scaling`, () => {
    test.use({ deviceScaleFactor: dpr });
    test(`real-size sprites are crisp: only the palette and the backdrop, every art pixel ${Math.round(2 * dpr)} device px`, async ({ page }) => {
      await page.goto("/?lab=companion&pause");
      await page.locator(sprite("react")).waitFor();
      const skin = SKINS["test-dummy"];
      const allowed = new Set([...skin.palettes.default.map(rgb), rgb("#f2f0ea")]);
      const k = Math.round(2 * dpr);
      for (const anim of REQUIRED_ANIMATIONS) {
        const box = (await page.locator(sprite(anim)).boundingBox())!;
        // The layout box is on the 4 px grid (pixel.ts), so its stored size is exact and whole device px.
        expect(box.width % 4, `${anim}: box ${box.width} px is off the layout grid`).toBe(0);
        expect(box.width * dpr, `${anim}: box ${box.width} px is not whole device px`).toBe(Math.round(box.width * dpr));
        // The whole box: nothing blended, including the spare transparent strip on the right and bottom.
        const all = await analyse(page, await page.screenshot({ clip: box, animations: "disabled" }));
        expect(all.colours.filter((c) => !allowed.has(c)), `${anim}: blended colours`).toEqual([]);
        // The art at its top-left: exactly grid × k device px, every colour run a whole number of art pixels.
        const side = (skin.grid * k) / dpr;
        const art = await analyse(page, await page.screenshot({ clip: { x: box.x, y: box.y, width: side, height: side }, animations: "disabled" }));
        expect(art.width, `${anim}: art in device px`).toBe(skin.grid * k);
        expect(art.runs.filter((r) => r % k !== 0), `${anim}: runs not a multiple of ${k}`).toEqual([]);
      }
    });
  });
}
