import { expect, test } from "@playwright/test";

// Phase 3 gate: visible keyboard focus on every interactive control (structure.css
// baseline `:focus-visible` outline; themes may restyle, not remove).
test("every control shows a visible outline when keyboard-focused", async ({ page }) => {
  await page.goto(`/?fixture=${encodeURIComponent("typical / all caps")}&layout=strip`);
  await expect(page.getByTestId("matrix-cell")).toBeVisible();

  const controls = ["mp-btn-prev", "mp-btn-play", "mp-btn-next", "mp-btn-lyrics", "mp-volume"];
  await page.keyboard.press("Tab");
  for (const cls of controls) {
    const focused = await page.evaluate(() => {
      const el = document.activeElement!;
      const s = getComputedStyle(el);
      return { cls: el.className, style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(focused.cls, "tab order").toBe(cls);
    expect(focused.style, `${cls} outline-style`).not.toBe("none");
    expect(focused.width, `${cls} outline-width`).toBeGreaterThan(0);
    await page.keyboard.press("Tab");
  }
});
