import { expect, test } from "@playwright/test";

// CLAUDE.md: UI strings come from docs/COPY.md; missing strings render "[NEEDS COPY]".
// While COPY.md has no approved values for these, the rendered UI must say so.
const url = (fixture: string) => `/?fixture=${encodeURIComponent(fixture)}&layout=strip`;

test("idle state and source badge render [NEEDS COPY], not invented text", async ({ page }) => {
  await page.goto(url("idle"));
  await expect(page.locator(".mp-empty")).toHaveText("[NEEDS COPY]");
  await expect(page.locator(".mp-source-badge")).toHaveText("[NEEDS COPY]");
});

test("transport buttons and volume are labelled [NEEDS COPY] (nothing hardcoded)", async ({ page }) => {
  await page.goto(url("typical / all caps"));
  for (const cls of ["mp-btn-prev", "mp-btn-play", "mp-btn-next", "mp-volume"]) {
    await expect(page.locator(`.${cls}`)).toHaveAttribute("aria-label", "[NEEDS COPY]");
  }
});

test("error detail from data is shown as-is; no hardcoded fallback text", async ({ page }) => {
  await page.goto(url("error"));
  await expect(page.locator(".mp-error")).toContainText("FIXTURE-ONLY-DEV-BUILD");
  await expect(page.locator(".mp-error")).not.toContainText("Something went wrong");
});
