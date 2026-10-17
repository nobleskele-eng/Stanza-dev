import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { flapAlphabet, padPage, paginate } from "../src/fx/flap";
import { WCAG_AA_NORMAL, contrastRatio, parseColor } from "../src/theme/contrast";

// Split-flap title (design round 2, step 3). The board must only ever show letters that are in the
// real old/new titles, keep an exact accessible copy, respect the window size, and fall back to
// plain text where the library would garble the input.

const T5 = JSON.parse(readFileSync("themes/t5-kinetic/theme.json", "utf8")) as { window: { height: number } };
const COLS = 10; // FLAP_GEOMETRY.title.cols
const url = (fixture: string, fx = "title:splitflap") =>
  `/?fixture=${encodeURIComponent(fixture)}&layout=card&theme=t5-kinetic&fx=${fx}`;

const TITLE_OF: Record<string, string> = {
  "typical / all caps": "FIXTURE-ONLY-DEV-BUILD Track Title",
  "CJK / accented characters": "FIXTURE-ONLY-DEV-BUILD 夜に駆ける —élève",
};

/** Every glyph currently held in the board's tiles (upper, lower and flipping halves). */
const boardGlyphs = () =>
  [...document.querySelectorAll(".mp-title[data-flap] [aria-hidden] span")].map((s) => s.textContent ?? "");
/** The settled text of the tiles: the upper half of each letter, in order. */
const boardText = () => {
  // Tolerant on purpose: the host exists a beat before the library builds its DOM, and poll() does not retry a throw.
  const root = document.querySelector(".mp-title[data-flap] [aria-hidden]")?.children[0]; // library root
  if (!root) return "";
  return [...root.children].map((letter) => letter.children[0].querySelector("span")?.textContent ?? "").join("");
};

for (const fixture of Object.keys(TITLE_OF)) {
  test(`split-flap: ${fixture} — accessible copy exact, board settles on the real first page, no invented glyphs`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto(url(fixture));
    await expect(page.locator(".mp-title[data-flap]")).toBeAttached();
    const title = TITLE_OF[fixture];
    const pages = paginate(title.toUpperCase(), COLS).map((p) => padPage(p, COLS));
    const allowed = new Set(flapAlphabet(pages));

    // Sample every glyph the board shows while it flips and settles: nothing outside the alphabet of
    // the real title (plus blank) may ever appear.
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      (await page.evaluate(boardGlyphs)).forEach((g) => seen.add(g));
      await page.waitForTimeout(40);
    }
    for (const g of seen) expect(g === "" || allowed.has(g), `unexpected glyph ${JSON.stringify(g)}`).toBe(true);

    // Accessible name: the one non-aria-hidden child is an exact copy of the real string.
    const sr = await page.evaluate(() => [...document.querySelector(".mp-title[data-flap]")!.children].find((c) => !c.hasAttribute("aria-hidden"))?.textContent);
    expect(sr).toBe(title);
    expect(await page.locator(".mp-title[data-flap] > div").getAttribute("aria-hidden")).toBe("true");

    // Settled on page 1 of the upper-cased, padded real title.
    await expect.poll(() => page.evaluate(boardText), { timeout: 5000 }).toBe(pages[0]);
    expect(errors).toEqual([]);
  });
}

test("split-flap: a multi-page title moves on to its next page, using only its own letters", async ({ page }) => {
  const fixture = "typical / all caps";
  await page.goto(url(fixture));
  await expect(page.locator(".mp-title[data-flap]")).toBeAttached(); // poll() does not retry a throwing callback
  const title = TITLE_OF[fixture];
  const pages = paginate(title.toUpperCase(), COLS).map((p) => padPage(p, COLS));
  expect(pages.length).toBeGreaterThan(1);
  await expect.poll(() => page.evaluate(boardText), { timeout: 5000 }).toBe(pages[0]);
  await expect.poll(() => page.evaluate(boardText), { timeout: 9000 }).toBe(pages[1]);
  const allowed = new Set(flapAlphabet(pages));
  for (const g of await page.evaluate(boardGlyphs)) expect(g === "" || allowed.has(g)).toBe(true);
});

// Endless paging re-ran the flip animation every 3.2 s for the whole track (DECISIONS.md, 2026-10-17 CPU pass), so a
// long title pages through twice and then rests on its first page. The fake clock runs the ~26 s schedule in moments.
test("split-flap: a multi-page title pages through twice, ends on its first page, and then stays there", async ({ page }) => {
  await page.clock.install();
  const fixture = "typical / all caps";
  await page.goto(url(fixture));
  await expect(page.locator(".mp-title[data-flap]")).toBeAttached();
  const pages = paginate(TITLE_OF[fixture].toUpperCase(), COLS).map((p) => padPage(p, COLS));
  // The board mounts a beat after the harness (later in WebKit); start once it first shows page 1.
  for (let i = 0; i < 100 && (await page.evaluate(boardText)) !== pages[0]; i++) await page.clock.runFor(100);
  // Then sample mid-interval: page turns come every 3.2 s from mount and a flip settles well within 1.5 s.
  await page.clock.runFor(1500);
  const shown = [await page.evaluate(boardText)];
  for (let tick = 1; tick <= pages.length * 2 + 2; tick++) {
    await page.clock.runFor(3200);
    shown.push(await page.evaluate(boardText));
  }
  const expected = [pages[0]];
  for (let tick = 1; tick <= pages.length * 2; tick++) expected.push(pages[tick % pages.length]);
  expected.push(pages[0], pages[0]); // two more page intervals: no further flips
  expect(shown).toEqual(expected);
});

test("split-flap: tile text has AA contrast against its tile", async ({ page }) => {
  await page.goto(url("typical / all caps"));
  await expect(page.locator(".mp-title[data-flap]")).toBeAttached();
  await page.waitForTimeout(1500);
  const pair = await page.evaluate(() => {
    const span = document.querySelector(".mp-title[data-flap] [aria-hidden] > div div span") as HTMLElement;
    const cs = getComputedStyle(span);
    return { fg: cs.color, bg: cs.backgroundColor };
  });
  const fg = parseColor(pair.fg);
  const bg = parseColor(pair.bg);
  expect(fg && bg, `unparseable ${pair.fg} / ${pair.bg}`).toBeTruthy();
  expect(contrastRatio(fg!, bg!)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
});

test("split-flap: the T5 window still fits with the board on, for the awkward fixtures", async ({ page }) => {
  for (const name of ["typical / all caps", "long title + artist (overflow test)", "CJK / accented characters", "no artwork, no album"]) {
    await page.goto(url(name));
    await expect(page.locator(".mp-window")).toBeVisible();
    await page.locator(".mp-window").hover();
    const box = (await page.locator(".mp-window").boundingBox())!;
    expect(box.height, `${name}: height`).toBeLessThanOrEqual(T5.window.height + 1);
  }
});

test("split-flap: text the library would garble (emoji) falls back to plain text", async ({ page }) => {
  await page.goto(url("emoji title (split-flap falls back to plain text)"));
  await expect(page.locator(".mp-title")).toBeAttached();
  await page.waitForTimeout(300);
  expect(await page.locator(".mp-title[data-flap]").count()).toBe(0);
  expect(await page.locator(".mp-title").textContent()).toContain("\u{1F389}");
});

test("split-flap: reduced motion shows plain static text, no board", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url("typical / all caps"));
  await expect(page.locator(".mp-title")).toBeAttached();
  await page.waitForTimeout(300);
  expect(await page.locator(".mp-title[data-flap]").count()).toBe(0);
  expect(await page.locator(".mp-title").textContent()).toBe(TITLE_OF["typical / all caps"]);
});

test("theme.json fx default: T5's own default effect is what the harness switches on when the theme is picked", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("typical / all caps").check();
  await page.getByLabel(/t5-kinetic/).check();
  await expect(page.locator(".mp-root")).toHaveAttribute("data-fx-title", "splitflap");
  await page.getByLabel(/t2-artwork/).check();
  await expect(page.locator(".mp-root")).not.toHaveAttribute("data-fx-title", /.*/); // switching theme resets
});
