import { expect, test } from "@playwright/test";
import { WCAG_AA_NORMAL, contrastRatio, parseColor } from "../src/theme/contrast";

// PLAN.md Phase 3 gate: "text on --mp-art-fg meets WCAG AA 4.5:1". Palette extraction
// (src/theme/palette.ts) runs client-side after the artwork <img> loads, so these read
// the vars off .mp-root once they're actually set rather than immediately after goto.

const ARTWORK_FIXTURES = ["very light artwork", "very dark artwork"];

async function readArtVars(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => {
    const root = document.querySelector(".mp-root");
    return !!root && getComputedStyle(root).getPropertyValue("--mp-art-fg").trim() !== "";
  });
  return page.evaluate(() => {
    const style = getComputedStyle(document.querySelector(".mp-root")!);
    return {
      art1: style.getPropertyValue("--mp-art-1").trim(),
      art2: style.getPropertyValue("--mp-art-2").trim(),
      art3: style.getPropertyValue("--mp-art-3").trim(),
      artFg: style.getPropertyValue("--mp-art-fg").trim(),
    };
  });
}

for (const name of ARTWORK_FIXTURES) {
  test(`--mp-art-fg meets WCAG AA 4.5:1 against --mp-art-1 — ${name}`, async ({ page }) => {
    await page.goto(`/?fixture=${encodeURIComponent(name)}&layout=strip`);
    await expect(page.getByTestId("matrix-cell")).toBeVisible();

    const { art1, art2, art3, artFg } = await readArtVars(page);
    const a1 = parseColor(art1);
    const fg = parseColor(artFg);
    expect(a1, `--mp-art-1 unparseable: "${art1}"`).toBeTruthy();
    expect(fg, `--mp-art-fg unparseable: "${artFg}"`).toBeTruthy();
    expect(contrastRatio(a1!, fg!), `art1=${art1} artFg=${artFg}`).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);

    // art2/art3 are declared for every artwork track, even a flat-colour fixture
    // (degenerate case: all three collapse to the same color, per palette.test.ts).
    expect(parseColor(art2)).toBeTruthy();
    expect(parseColor(art3)).toBeTruthy();
  });
}

test("--mp-art-* are absent when the track has no artwork", async ({ page }) => {
  await page.goto(`/?fixture=${encodeURIComponent("no artwork, no album")}&layout=strip`);
  await expect(page.getByTestId("matrix-cell")).toBeVisible();
  const value = await page.evaluate(
    () => getComputedStyle(document.querySelector(".mp-root")!).getPropertyValue("--mp-art-fg").trim(),
  );
  expect(value).toBe("");
});
