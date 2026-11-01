import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fixtures } from "../dev/fixtures/nowPlaying";
import { measureShelf, shelfLine, type Box } from "../src/companion/measure";
import type { Skin } from "../src/companion/skin";
import type { ThemeManifest } from "../src/theme/variant";

// Contract v10 (M2 C5b): a theme's declared shelf has room for every species in every fixture state. The dev harness
// renders each card theme × fixture; the boxes it lays out go through the same pure functions the companion's layer
// uses (`shelfLine`, `measureShelf`), at 100% (2 px per art pixel) and 125% (2.4). On the shelf nothing can cover a
// part (`measureShelf` trims it so); this checks that what's left is a real shelf, with its door, in every state.

const SKINS: Skin[] = readdirSync(new URL("../companions/", import.meta.url))
  .filter((id) => !id.startsWith("."))
  .map((id) => JSON.parse(readFileSync(new URL(`../companions/${id}/companion.json`, import.meta.url), "utf8")));
const THEMES = readdirSync(new URL("../themes/", import.meta.url))
  .map((id) => JSON.parse(readFileSync(new URL(`../themes/${id}/theme.json`, import.meta.url), "utf8")) as ThemeManifest)
  .filter((m) => m.companion?.shelf);
/** The parts the pet must never cover (the same list CompanionLayer.tsx measures, written out). */
const PART_SELECTOR = [
  ".mp-artwork", ".mp-meta", ".mp-progress", ".mp-time-current", ".mp-time-total", ".mp-controls",
  ".mp-volume-wrap", ".mp-link-out", ".mp-source-badge", ".mp-empty", ".mp-error",
].join(", ");
/** A shelf this short (art px) is no room to walk: a few strides of the slowest walker. */
const SHORTEST = 16;

test("every shelf-declaring theme is a card theme with its shelf beside the badge", () => {
  expect(THEMES.map((m) => [m.id, m.layout, m.companion!.shelf])).toEqual(
    ["t1-default", "t2-artwork", "t4-extreme", "t5-kinetic"].map((id) => [id, "card", { side: "left", beside: ".mp-source-badge" }]),
  );
});

for (const theme of THEMES)
  test(`${theme.id}: the shelf has room for every species in every fixture, at 100% and 125%`, async ({ page }) => {
    test.setTimeout(120_000);
    const shelf = theme.companion!.shelf!;
    const wrong: string[] = [];
    const shortest: Record<string, number> = {};
    for (const name of Object.keys(fixtures)) {
      await page.goto(`/?fixture=${encodeURIComponent(name)}&theme=${theme.id}&layout=${theme.layout}`);
      await page.locator(".mp-window").waitFor();
      // Fonts and the artwork settle the layout.
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);
      const boxes = await page.evaluate(
        ([selector, beside]) => {
          const box = (el: Element) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
          };
          const card = document.querySelector(".mp-window")!;
          const b = card.querySelector(beside);
          return { card: box(card), parts: [...card.querySelectorAll(selector)].map(box), beside: b ? box(b) : null };
        },
        [PART_SELECTOR, shelf.beside] as const,
      );
      const line = shelfLine(shelf.side, boxes.card as Box, boxes.beside as Box | null);
      if (!line) {
        wrong.push(`${name}: no line (is ${shelf.beside} there?)`);
        continue;
      }
      for (const px of [2, 2.4])
        for (const skin of SKINS) {
          const found = measureShelf(skin, boxes.card, line, boxes.parts, px);
          const length = found ? Math.round(found.edge.width / px) : 0;
          const key = `${skin.id} at ${px}`;
          shortest[key] = Math.min(shortest[key] ?? Infinity, length);
          if (!found) wrong.push(`${name}, ${key}: no shelf`);
          else if (!found.doors.includes(shelf.side)) wrong.push(`${name}, ${key}: no door on the ${shelf.side}`);
          else if (length < SHORTEST) wrong.push(`${name}, ${key}: only ${length} art px`);
        }
    }
    test.info().annotations.push({ type: "shortest shelf (art px)", description: JSON.stringify(shortest) });
    expect(wrong).toEqual([]);
  });
