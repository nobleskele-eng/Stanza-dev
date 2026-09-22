import { expect, test } from "@playwright/test";
import { fixtures } from "../dev/fixtures/nowPlaying";
import { WCAG_AA_NORMAL, contrastRatio, parseColor } from "../src/theme/contrast";

// T1 is the only theme implemented so far and it styles the strip layout only
// (pill/card are structure-only placeholders until Phase 4).
const LAYOUT = "strip";

const TEXT_PARTS = [
  ".mp-title",
  ".mp-artist",
  ".mp-album",
  ".mp-time-current",
  ".mp-time-total",
  ".mp-source-badge",
  ".mp-link-out",
  ".mp-empty",
  ".mp-error",
  ".mp-btn-prev",
  ".mp-btn-next",
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

for (const name of Object.keys(fixtures)) {
  test(`T1 ${LAYOUT} — ${name}`, async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
    page.on("pageerror", (e) => consoleErrors.push(e.message));

    await page.goto(`/?fixture=${encodeURIComponent(name)}&layout=${LAYOUT}`);
    const cell = page.getByTestId("matrix-cell");
    await expect(cell).toBeVisible();
    await expect(page.locator(".mp-source-badge")).toBeVisible(); // D10: never hidden

    await cell.screenshot({
      path: `e2e/screenshots/${testInfo.project.name}/${slug(name)}.png`,
      animations: "disabled",
    });

    const pairs = await page.evaluate((parts) => {
      const bg = getComputedStyle(document.querySelector(".mp-window")!).backgroundColor;
      return parts.flatMap((sel) => {
        const el = document.querySelector(sel);
        return el ? [{ sel, fg: getComputedStyle(el).color, bg }] : [];
      });
    }, TEXT_PARTS);

    for (const { sel, fg, bg } of pairs) {
      const f = parseColor(fg);
      const b = parseColor(bg);
      expect(f && b, `${sel}: unparseable color ${fg} / ${bg}`).toBeTruthy();
      expect.soft(contrastRatio(f!, b!), `${sel} ${fg} on ${bg}`).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    }

    expect(consoleErrors).toEqual([]);
  });
}
