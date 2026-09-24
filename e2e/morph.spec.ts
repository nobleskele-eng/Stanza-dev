import { expect, test, type Page } from "@playwright/test";

// Track-change morph (design round 2, step 5): the app wraps a track swap in
// document.startViewTransition(); T5 styles it as a cassette swap. These run against the dev harness
// (`/`), which has a real store so fixtures can change the track.

const A = "typical / all caps"; // title "...Track Title"
const B = "CJK / accented characters"; // a different title
const C = "long title + artist (overflow test)"; // a third

const spy = () => {
  const w = window as unknown as { __vt: { calls: number; anims?: string[]; finished?: boolean; errors: string[] } };
  w.__vt = { calls: 0, errors: [] };
  const orig = (document as Document & { startViewTransition?: (cb: () => void) => ViewTransition }).startViewTransition?.bind(document);
  if (!orig) return;
  (document as unknown as { startViewTransition: unknown }).startViewTransition = (cb: () => void) => {
    w.__vt.calls++;
    const t = orig(cb);
    t.ready.then(
      () => (w.__vt.anims = document.documentElement.getAnimations({ subtree: true }).map((a) => (a as CSSAnimation).animationName).filter(Boolean)),
      (e) => w.__vt.errors.push(`ready:${e}`),
    );
    t.finished.then(
      () => (w.__vt.finished = true),
      (e) => w.__vt.errors.push(`finished:${e}`),
    );
    return t;
  };
};

const vt = (page: Page) => page.evaluate(() => (window as unknown as { __vt: { calls: number; anims?: string[]; finished?: boolean; errors: string[] } }).__vt);
const title = (page: Page) => page.locator(".mp-root").getAttribute("data-title");

async function open(page: Page, theme: string, fixture = A) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(spy);
  await page.goto("/");
  await page.getByLabel(fixture).check();
  await page.getByLabel(new RegExp(theme)).check();
  await expect(page.locator(".mp-root")).toHaveAttribute("data-title", /.+/);
  return errors;
}

test("morph: a track change starts ONE view transition, ends on the new track, and T5's cassette animations run", async ({ page }) => {
  const errors = await open(page, "t5-kinetic");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-fx-morph", "true");
  expect(await page.locator(".mp-window").evaluate((e) => getComputedStyle(e).viewTransitionName)).toBe("mp-card");
  const supported = await page.evaluate(() => typeof (document as Document & { startViewTransition?: unknown }).startViewTransition === "function");
  const before = await title(page);
  const calls0 = (await vt(page)).calls;

  await page.getByLabel(B).check();
  await expect.poll(() => title(page)).not.toBe(before); // ends on the new track
  expect(await title(page)).toContain("夜に駆ける");

  if (supported) {
    await expect.poll(async () => (await vt(page)).calls).toBe(calls0 + 1);
    await expect.poll(async () => (await vt(page)).finished, { timeout: 5000 }).toBe(true);
    const s = await vt(page);
    expect(s.errors).toEqual([]);
    // Chromium exposes the pseudo-element animations; WebKit builds may not, so only assert when present.
    if (s.anims && s.anims.length > 0) expect(s.anims).toEqual(expect.arrayContaining(["t5-deck-out", "t5-deck-in"]));
  }
  expect(errors).toEqual([]);
});

test("morph: changes that are not a new track (play/pause) pass straight through — no transition, no held-back frame", async ({ page }) => {
  const errors = await open(page, "t5-kinetic");
  const calls0 = (await vt(page)).calls;
  const status = () => page.locator(".mp-root").getAttribute("data-status");
  const s0 = await status();
  await page.getByRole("button", { name: "play/pause" }).click();
  await expect.poll(status).not.toBe(s0);
  expect((await vt(page)).calls).toBe(calls0);
  expect(errors).toEqual([]);
});

test("morph: a theme without the effect never starts a transition, and still updates immediately", async ({ page }) => {
  const errors = await open(page, "t2-artwork");
  await expect(page.locator(".mp-root")).not.toHaveAttribute("data-fx-morph", /.*/);
  await page.getByLabel(B).check();
  await expect.poll(() => title(page)).toContain("夜に駆ける");
  expect((await vt(page)).calls).toBe(0);
  expect(await page.locator(".mp-window").evaluate((e) => getComputedStyle(e).viewTransitionName)).toBe("none");
  expect(errors).toEqual([]);
});

test("morph: reduced motion swaps instantly with no transition", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = await open(page, "t5-kinetic");
  await page.getByLabel(B).check();
  await expect.poll(() => title(page)).toContain("夜に駆ける");
  expect((await vt(page)).calls).toBe(0);
  expect(errors).toEqual([]);
});

test("morph: where View Transitions are unsupported the swap is instant and error-free", async ({ page }) => {
  await page.addInitScript(() => {
    (document as unknown as { startViewTransition: unknown }).startViewTransition = undefined;
  });
  const errors = await open(page, "t5-kinetic");
  await page.getByLabel(B).check();
  await expect.poll(() => title(page)).toContain("夜に駆ける");
  expect(errors).toEqual([]);
});

test("morph: rapid successive track changes settle on the last one", async ({ page }) => {
  const errors = await open(page, "t5-kinetic");
  await page.getByLabel(B).check();
  await page.getByLabel(C).check();
  await page.getByLabel(A).check();
  await page.getByLabel(C).check();
  await expect.poll(() => title(page), { timeout: 6000 }).toContain("A Track Title So Long");
  await page.waitForTimeout(1500); // let any in-flight transition finish; the state must not flip back
  expect(await title(page)).toContain("A Track Title So Long");
  expect(errors).toEqual([]);
});

test("morph: the artwork's own opacity is untouched (guard still holds; the transition uses no fade)", async ({ page }) => {
  await open(page, "t5-kinetic", "colorful artwork (filter test)");
  await page.getByLabel(A).check();
  await expect.poll(() => title(page)).toContain("Track Title");
  await page.waitForTimeout(1200);
  expect(await page.locator(".mp-artwork").evaluate((e) => getComputedStyle(e).opacity)).toBe("1");
  // T5's cassette animations must not fade: neither keyframe sets opacity.
  const css = await page.evaluate(() =>
    [...document.styleSheets].flatMap((s) => {
      try {
        return [...s.cssRules].filter((r) => r instanceof CSSKeyframesRule && /^t5-deck-/.test(r.name)).map((r) => r.cssText);
      } catch {
        return [];
      }
    }),
  );
  expect(css.length).toBe(2);
  for (const rule of css) expect(rule).not.toMatch(/opacity/);
});
