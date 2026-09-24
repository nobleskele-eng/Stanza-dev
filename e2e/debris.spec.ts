import { expect, test, type Page } from "@playwright/test";

// Physics debris (design round 2, step 6): the previous title's letters spill out on a track change.
// Run against the dev harness (`/`, real store) with T5, which ships the effect on.

const A = "typical / all caps"; // "FIXTURE-ONLY-DEV-BUILD Track Title"  (contains a lowercase 'k')
const B = "CJK / accented characters"; // "...夜に駆ける —élève"            (no 'k')
const C = "long title + artist (overflow test)";
const OLD_A = "FIXTURE-ONLY-DEV-BUILD Track Title";

async function open(page: Page, theme = "t5-kinetic", fixture = A) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel(fixture).check();
  await page.getByLabel(new RegExp(theme)).check();
  await expect(page.locator(".mp-root")).toHaveAttribute("data-title", /.+/);
  return errors;
}

const letters = (page: Page) => page.evaluate(() => [...document.querySelectorAll(".mp-debris span")].map((s) => s.textContent ?? ""));
const count = (page: Page) => page.locator(".mp-debris span").count();

test("debris: the OLD title's letters spill after a track change, in a decorative, contained layer", async ({ page }) => {
  const errors = await open(page);
  expect(await count(page)).toBe(0); // nothing until a track changes
  await expect(page.locator(".mp-debris")).toHaveAttribute("aria-hidden", "true");

  await page.getByLabel(B).check();
  await expect.poll(() => count(page), { timeout: 8000 }).toBeGreaterThan(0);

  const got = await letters(page);
  expect(got.length).toBeLessThanOrEqual(32);
  // Only characters of the title that was just replaced — and 'k' exists only in the old title.
  for (const ch of got) expect(OLD_A).toContain(ch);
  expect(got).toContain("k");

  const info = await page.evaluate(() => {
    const layer = document.querySelector(".mp-debris") as HTMLElement;
    const cs = getComputedStyle(layer);
    const w = document.querySelector(".mp-window")!.getBoundingClientRect();
    const spans = [...layer.querySelectorAll("span")].map((s) => s.getBoundingClientRect());
    return {
      pe: cs.pointerEvents,
      z: cs.zIndex,
      overflow: cs.overflow,
      // The layer clips, but the physics walls should also keep letters inside the card horizontally.
      inside: spans.every((r) => r.left >= w.left - 3 && r.right <= w.right + 3),
    };
  });
  expect(info.pe).toBe("none");
  expect(info.z).toBe("-1");
  expect(info.overflow).toBe("hidden");
  expect(info.inside).toBe(true);

  // The new title is untouched, normal text (the debris is never the readable copy).
  const sr = await page.evaluate(() => [...document.querySelector(".mp-title")!.children].find((c) => !c.hasAttribute("aria-hidden"))?.textContent);
  expect(sr).toContain("夜に駆ける");
  expect(errors).toEqual([]);
});

test("debris: it really simulates (letters move), then cleans itself up completely", async ({ page }) => {
  await open(page);
  await page.getByLabel(B).check();
  await expect.poll(() => count(page), { timeout: 8000 }).toBeGreaterThan(0);
  const pos = () => page.evaluate(() => (document.querySelector(".mp-debris span") as HTMLElement).style.transform);
  const first = await pos();
  await expect.poll(pos, { timeout: 3000 }).not.toBe(first); // moving
  await expect.poll(() => count(page), { timeout: 8000 }).toBe(0); // and gone after its lifetime
  expect(await page.locator(".mp-debris").evaluate((e) => e.childElementCount)).toBe(0);
});

test("debris: Matter.js is loaded lazily — not until the first spill", async ({ page }) => {
  await open(page);
  const matterLoaded = () => page.evaluate(() => performance.getEntriesByType("resource").some((e) => /matter/i.test(e.name)));
  expect(await matterLoaded()).toBe(false);
  await page.getByLabel(B).check();
  await expect.poll(() => count(page), { timeout: 8000 }).toBeGreaterThan(0);
  expect(await matterLoaded()).toBe(true);
});

test("debris: a new track cuts a spill that is still running, and the layer still ends empty", async ({ page }) => {
  const errors = await open(page);
  await page.getByLabel(B).check();
  await expect.poll(() => count(page), { timeout: 8000 }).toBeGreaterThan(0);
  await page.getByLabel(C).check(); // mid-spill
  // The first spill (letters of A, which alone contain "k") is cut and replaced by the second (letters of B,
  // which alone contain 夜): both facts must hold at once at some point, and never a mixture of the two.
  await expect.poll(async () => (await letters(page)).includes("夜"), { timeout: 8000 }).toBe(true);
  expect(await letters(page)).not.toContain("k");
  await expect.poll(() => count(page), { timeout: 10000 }).toBe(0);
  expect(errors).toEqual([]);
});

test("debris: changes that keep the same title (play/pause) spill nothing", async ({ page }) => {
  const errors = await open(page);
  await page.getByRole("button", { name: "play/pause" }).click();
  await page.waitForTimeout(1800);
  expect(await count(page)).toBe(0);
  expect(errors).toEqual([]);
});

test("debris: a theme without the effect spills nothing", async ({ page }) => {
  await open(page, "t2-artwork");
  await expect(page.locator(".mp-debris")).toHaveCount(0);
  await page.getByLabel(B).check();
  await page.waitForTimeout(1800);
  await expect(page.locator(".mp-debris")).toHaveCount(0);
});

test("debris: reduced motion spills nothing", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await page.getByLabel(B).check();
  await page.waitForTimeout(2000);
  expect(await count(page)).toBe(0);
});
