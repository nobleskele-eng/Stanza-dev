import { expect, test } from "@playwright/test";

// CLAUDE.md: UI strings come from docs/COPY.md; missing strings render "[NEEDS COPY]".
// The expected strings below are COPY.md's approved values (2026-10-22); a slot still unwritten must say [NEEDS COPY].
const url = (fixture: string) => `/?fixture=${encodeURIComponent(fixture)}&layout=strip`;

test("idle state and source badge render COPY.md's text", async ({ page }) => {
  await page.goto(url("idle"));
  await expect(page.locator(".mp-empty")).toHaveText("idle");
  await expect(page.locator(".mp-source-badge")).toHaveText("Spotify");
});

test("transport buttons and volume are labelled from COPY.md", async ({ page }) => {
  await page.goto(url("typical / all caps"));
  await expect(page.locator(".mp-btn-prev")).toHaveAttribute("aria-label", "Previous");
  await expect(page.locator(".mp-btn-play")).toHaveAttribute("aria-label", /^(Play|Pause)$/);
  await expect(page.locator(".mp-btn-next")).toHaveAttribute("aria-label", "Next");
  await expect(page.locator(".mp-volume")).toHaveAttribute("aria-label", "Volume");
});

test("error detail from data is shown as-is; no hardcoded fallback text", async ({ page }) => {
  await page.goto(url("error"));
  await expect(page.locator(".mp-error")).toContainText("FIXTURE-ONLY-DEV-BUILD");
  await expect(page.locator(".mp-error")).not.toContainText("Something went wrong");
});
