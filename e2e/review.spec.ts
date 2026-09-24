import { expect, test } from "@playwright/test";
import { fixtures } from "../dev/fixtures/nowPlaying";

// Review images for visual sign-off (CLAUDE.md: visual work = "ready for review"). 2x so text
// is legible; written to e2e/review/<browser>/ (gitignored) and assembled into contact sheets
// by scripts/review-sheet.mjs. Not assertions about pixels — see matrix/contract specs for those.
test.use({ deviceScaleFactor: 2 });

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const url = (fixture: string, layout = "card", theme = "t1-default") =>
  `/?fixture=${encodeURIComponent(fixture)}&layout=${layout}&theme=${theme}`;

// One entry per theme built so far (docs/PLAN.md §4 theme roster).
const THEMES = [
  { id: "card-t1", themeId: "t1-default", layout: "card" },
  { id: "card", themeId: "t2-artwork", layout: "card" },
  { id: "pill", themeId: "t3-pill", layout: "pill" },
  { id: "card-extreme", themeId: "t4-extreme", layout: "card" },
  { id: "card-kinetic", themeId: "t5-kinetic", layout: "card" },
];

for (const { id, themeId, layout } of THEMES) {
  for (const name of Object.keys(fixtures)) {
    test(`review image: ${id} — ${name}`, async ({ page }, testInfo) => {
      await page.goto(url(name, layout, themeId));
      const cell = page.getByTestId("matrix-cell");
      await expect(cell).toBeVisible();
      await cell.screenshot({
        path: `e2e/review/${testInfo.project.name}/state--${id}--${slug(name)}.png`,
        animations: "disabled",
      });
    });
  }
}

test("review images: layouts, hover, keyboard focus", async ({ page }, testInfo) => {
  const out = (n: string) => `e2e/review/${testInfo.project.name}/${n}.png`;
  for (const { id, layout, themeId } of THEMES) {
    await page.goto(url("typical / all caps", layout, themeId));
    await page.getByTestId("matrix-cell").screenshot({ path: out(`layout--${id}`), animations: "disabled" });
  }
  await page.goto(url("typical / all caps"));
  await page.locator(".mp-window").hover();
  await expect(page.locator(".mp-root")).toHaveAttribute("data-hover", "true");
  await page.getByTestId("matrix-cell").screenshot({ path: out("interaction--hover"), animations: "disabled" });

  await page.mouse.move(2, 2);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab"); // → play button
  await expect(page.locator(".mp-btn-play")).toBeFocused();
  await page.getByTestId("matrix-cell").screenshot({ path: out("interaction--keyboard-focus-play"), animations: "disabled" });

  // T3's whole identity is the collapsed/expanded pill — worth its own before/after pair.
  await page.goto(url("typical / all caps", "pill", "t3-pill"));
  await page.getByTestId("matrix-cell").screenshot({ path: out("interaction--pill-collapsed"), animations: "disabled" });
  await page.locator(".mp-window").hover();
  await expect(page.locator(".mp-root")).toHaveAttribute("data-hover", "true");
  await page.getByTestId("matrix-cell").screenshot({ path: out("interaction--pill-expanded-hover"), animations: "disabled" });
});
