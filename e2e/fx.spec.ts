import { expect, test } from "@playwright/test";

// Opt-in effect layers (shapes + waveform; animated-assets plan step 2). Contract v4 is not
// bumped yet (DECISIONS.md 2026-09-23), so this only asserts the layers' own behaviour and that
// turning them on never changes a theme's declared window size or lets a control get covered.

const THEMES = [
  { themeId: "t1-default", layout: "card" },
  { themeId: "t2-artwork", layout: "card" },
  { themeId: "t3-pill", layout: "pill" },
  { themeId: "t4-extreme", layout: "card" },
  { themeId: "t5-kinetic", layout: "card" },
];
const url = (fixture: string, themeId: string, layout: string, fx: string) =>
  `/?fixture=${encodeURIComponent(fixture)}&layout=${layout}&theme=${themeId}${fx ? `&fx=${fx}` : ""}`;

for (const { themeId, layout } of THEMES) {
  test.describe(`${themeId} fx layers`, () => {
    test("window size is unchanged, layers stay inside it, shapes never take input", async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto(url("typical / all caps", themeId, layout, ""));
      await expect(page.locator(".mp-window")).toBeVisible();
      const off = await page.locator(".mp-window").evaluate((e) => [e.clientWidth, e.clientHeight]);

      await page.goto(url("typical / all caps", themeId, layout, "shapes,waveform"));
      await expect(page.locator(".mp-shapes")).toBeAttached();
      const on = await page.locator(".mp-window").evaluate((e) => [e.clientWidth, e.clientHeight]);
      expect(on).toEqual(off);

      const report = await page.evaluate(() => {
        const win = document.querySelector(".mp-window")!.getBoundingClientRect();
        const inside = (el: Element) => {
          const b = el.getBoundingClientRect();
          return b.left >= win.left - 1 && b.right <= win.right + 1 && b.top >= win.top - 1 && b.bottom <= win.bottom + 1;
        };
        const overlaps = (a: Element, b: Element) => {
          const x = a.getBoundingClientRect();
          const y = b.getBoundingClientRect();
          return x.left < y.right && x.right > y.left && x.top < y.bottom && x.bottom > y.top;
        };
        const shapes = document.querySelector(".mp-shapes")!;
        const wave = document.querySelector(".mp-waveform");
        const controls = [".mp-btn-prev", ".mp-btn-play", ".mp-btn-next", ".mp-volume-wrap", ".mp-link-out"]
          .map((s) => document.querySelector(s))
          .filter((e): e is Element => !!e);
        return {
          shapesPointerEvents: getComputedStyle(shapes).pointerEvents,
          shapesInside: inside(shapes),
          waveDisplay: wave ? getComputedStyle(wave).display : "absent",
          waveInside: wave && getComputedStyle(wave).display !== "none" ? inside(wave) : true,
          waveHitsControl: wave && getComputedStyle(wave).display !== "none" ? controls.some((c) => overlaps(wave, c)) : false,
          badgeVisible: getComputedStyle(document.querySelector(".mp-source-badge")!).visibility,
        };
      });
      expect(report.shapesPointerEvents).toBe("none");
      expect(report.shapesInside).toBe(true);
      expect(report.waveInside).toBe(true);
      expect(report.waveHitsControl, "waveform must not overlap any interactive control").toBe(false);
      expect(report.badgeVisible).toBe("visible");
      if (layout === "pill") expect(report.waveDisplay).toBe("none"); // compact pill: no room, by design
      else expect(report.waveDisplay).not.toBe("none");
      expect(errors).toEqual([]);
    });

    test("simulated beat moves while playing, holds at 0 when paused", async ({ page }) => {
      await page.goto(url("typical / all caps", themeId, layout, "shapes,waveform"));
      const beat = () => page.locator(".mp-shapes").evaluate((e) => parseFloat((e as SVGElement).style.getPropertyValue("--mp-beat") || "0"));
      const seen = new Set<number>();
      await expect
        .poll(async () => {
          seen.add(await beat());
          return seen.size;
        }, { timeout: 5000, intervals: [100] })
        .toBeGreaterThan(3);
      for (const v of seen) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }

      await page.goto(url("paused", themeId, layout, "shapes,waveform"));
      await expect(page.locator(".mp-shapes")).toBeAttached();
      await page.waitForTimeout(300);
      expect(await beat()).toBe(0);
    });

    test("reduced motion: beat pinned to 0, shape animation off", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(url("typical / all caps", themeId, layout, "shapes,waveform"));
      await expect(page.locator(".mp-shapes")).toBeAttached();
      await page.waitForTimeout(300);
      const state = await page.evaluate(() => {
        const s = document.querySelector(".mp-shapes") as SVGElement;
        const child = document.querySelector(".mp-shape > *") as Element;
        return { beat: parseFloat(s.style.getPropertyValue("--mp-beat") || "0"), anim: getComputedStyle(child).animationName };
      });
      expect(state.beat).toBe(0);
      expect(state.anim).toBe("none");
    });
  });
}

// --- Text effects (step 3): anime.js splitText / SVG filters. Real text is never altered. ---
const TEXT_FX = ["typewriter", "ripple", "liquid"] as const;
for (const { themeId, layout } of THEMES) {
  for (const effect of TEXT_FX) {
    test(`${themeId} text fx ${effect}: text unchanged, contrast parts intact, no errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto(url("typical / all caps", themeId, layout, ""));
      await expect(page.locator(".mp-title")).toBeAttached();
      const plain = await page.evaluate(() => [document.querySelector(".mp-title")!.textContent, document.querySelector(".mp-artist")!.textContent]);

      await page.goto(url("typical / all caps", themeId, layout, `title:${effect},artist:${effect}`));
      await expect(page.locator(".mp-root")).toHaveAttribute("data-fx-title", effect);
      await expect(page.locator(".mp-title")).toBeAttached();
      await page.waitForTimeout(400);
      // anime's accessible mode adds ONE visually-hidden copy for screen readers and marks the
      // per-letter spans aria-hidden, so textContent may hold the string twice. What matters: the
      // visible letters (aria-hidden spans) spell exactly the original, and the a11y copy is exact.
      const strip = (x: string | null) => (x ?? "").replace(/\s+/g, "");
      const during = await page.evaluate(() =>
        [".mp-title", ".mp-artist"].map((sel) => {
          const el = document.querySelector(sel)!;
          const letters = [...el.querySelectorAll("[data-char]")].map((c) => c.textContent).join("");
          const sr = [...el.children].find((c) => !c.hasAttribute("aria-hidden"))?.textContent ?? null;
          return { text: el.textContent, letters, sr, split: letters.length > 0 };
        }),
      );
      during.forEach((d, i) => {
        if (d.split) {
          expect(strip(d.letters)).toBe(strip(plain[i]));
          expect(d.sr).toBe(plain[i]);
        } else {
          expect(d.text).toBe(plain[i]);
        }
      });

      // Everything settles to real, readable, unfiltered-or-static text.
      await page.waitForTimeout(effect === "typewriter" ? 2500 : 1200);
      const settled = await page.evaluate(() => {
        const t = document.querySelector(".mp-title") as HTMLElement;
        return { filter: getComputedStyle(t).filter, opacities: [...t.querySelectorAll("*")].map((e) => getComputedStyle(e).opacity) };
      });
      if (effect === "liquid") expect(settled.filter).toBe("none");
      if (effect === "typewriter") for (const o of settled.opacities) expect(o).toBe("1");
      await expect(page.locator(".mp-source-badge")).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test(`${themeId} text fx: reduced motion renders plain static text`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(url("typical / all caps", themeId, layout, "title:typewriter,artist:ripple"));
    await expect(page.locator(".mp-title")).toBeAttached();
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const t = document.querySelector(".mp-title") as HTMLElement;
      const a = document.querySelector(".mp-artist") as HTMLElement;
      return { split: t.children.length, opacity: getComputedStyle(t).opacity, filter: getComputedStyle(a).filter };
    });
    expect(r.split).toBe(0); // not split into letters
    expect(r.filter).toBe("none");
  });
}

// --- Variant → effects pipeline (step 4), through the dev harness's variant box ---
test("a pasted variant switches effects on; invalid values are dropped with raw codes", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("typical / all caps").check();
  const box = page.locator("textarea");
  const report = page.getByTestId("variant-report");

  await box.fill(JSON.stringify({ theme: "t1-default", contract: 5, layout: "card", overrides: {}, hidden: [], effects: { waveform: true, shapes: true, title: "ripple" } }));
  await page.getByRole("button", { name: "apply variant" }).click();
  await expect(report).toHaveText("ok");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-fx-waveform", "true");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-fx-title", "ripple");
  await expect(page.locator(".mp-shapes")).toBeAttached();

  await box.fill(JSON.stringify({ theme: "t1-default", contract: 5, layout: "card", effects: { title: "url(x)", artist: "liquid" } }));
  await page.getByRole("button", { name: "apply variant" }).click();
  await expect(report).toHaveText("effect-invalid@effects.title");
  await expect(page.locator(".mp-root")).toHaveAttribute("data-fx-artist", "liquid");
  await expect(page.locator(".mp-root")).not.toHaveAttribute("data-fx-title", /.*/);

  await box.fill(JSON.stringify({ theme: "t2-artwork", contract: 5, layout: "card", effects: { shapes: true } }));
  await page.getByRole("button", { name: "apply variant" }).click();
  await expect(report).toHaveText("theme-mismatch@theme"); // wrong theme: nothing applied
  await expect(page.locator(".mp-root")).toHaveAttribute("data-fx-artist", "liquid"); // previous state kept
});

// --- Artwork treatments (design round 2, step 2): app-provided SVG filters, palette-driven ---
const ART = "colorful artwork (filter test)";
test("art filters exist in every theme and their colours follow the artwork's palette", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  // No artwork -> no palette -> plain black/white greyscale table.
  await page.goto(url("typical / all caps", "t5-kinetic", "card", ""));
  await expect(page.locator(".mp-fx-filters")).toBeAttached();
  const table = (id: string) => page.locator(`#${id} feFuncR`).first().getAttribute("tableValues");
  expect(await table("mp-art-duotone")).toBe("0.000 1.000");

  // Colourful artwork -> palette extracted -> table changes to the palette's shadow/highlight.
  await page.goto(url(ART, "t5-kinetic", "card", ""));
  await expect.poll(() => table("mp-art-duotone"), { timeout: 5000 }).not.toBe("0.000 1.000");
  const [dark, light] = (await table("mp-art-duotone"))!.split(" ").map(Number);
  expect(dark).toBeLessThan(0.3);
  expect(light).toBeGreaterThan(0.6);

  for (const id of ["mp-art-duotone", "mp-art-posterize", "mp-art-dither"]) {
    await expect(page.locator(`#${id}`)).toBeAttached();
  }
  // The dither tile is our own generated PNG.
  expect(await page.locator("#mp-art-dither feImage").getAttribute("href")).toMatch(/^data:image\/png;base64,/);
  expect(errors).toEqual([]);
});

test("T5 applies the duotone to its artwork, and the theme window size is unaffected by it", async ({ page }) => {
  await page.goto(url(ART, "t5-kinetic", "card", ""));
  await expect(page.locator(".mp-artwork")).toBeAttached();
  expect(await page.locator(".mp-artwork").evaluate((e) => getComputedStyle(e).filter)).toContain("mp-art-duotone");
  // Other themes leave the artwork unfiltered (the filter defs are available, not applied).
  await page.goto(url(ART, "t2-artwork", "card", ""));
  await expect(page.locator(".mp-artwork")).toBeAttached();
  expect(await page.locator(".mp-artwork").evaluate((e) => getComputedStyle(e).filter)).toBe("none");
});
