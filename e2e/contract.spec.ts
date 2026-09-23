import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { fixtures } from "../dev/fixtures/nowPlaying";

// docs/THEME_CONTRACT.md is the source of truth. These tests read it and compare it with
// what the player really renders, so the doc can't quietly drift from the code.

const contract = readFileSync("docs/THEME_CONTRACT.md", "utf8");

interface ThemeJson {
  id: string;
  contract: number;
  layout: string;
  window: { width: number; height: number };
}

// Every theme built so far, each styling exactly one layout (docs/PLAN.md §4 theme roster).
const THEMES = ["t1-default", "t2-artwork", "t3-pill", "t4-extreme"].map((id) => ({
  id,
  json: JSON.parse(readFileSync(`themes/${id}/theme.json`, "utf8")) as ThemeJson,
}));

/** Bullet items of the form "- `<token>` …" inside one `## ` section. */
function bulletTokens(section: string, pattern: RegExp): string[] {
  const start = contract.indexOf(`\n## ${section}`);
  expect(start, `section "${section}" exists`).toBeGreaterThan(-1);
  const rest = contract.slice(start + 1);
  const end = rest.indexOf("\n## ", 3);
  const body = end === -1 ? rest : rest.slice(0, end);
  return body.split("\n").flatMap((line) => {
    const m = pattern.exec(line);
    return m ? [m[1]] : [];
  });
}

const documentedParts = bulletTokens("Parts", /^- `\.(mp-[a-z-]+)`/);
const documentedRootAttrs = bulletTokens("Root", /^- `(data-[a-z-]+)`/);

const url = (fixture: string, layout = "card", theme = "t1-default") =>
  `/?fixture=${encodeURIComponent(fixture)}&layout=${layout}&theme=${theme}`;

async function open(page: Page, fixture: string, layout = "card", theme = "t1-default") {
  await page.goto(url(fixture, layout, theme));
  await expect(page.getByTestId("matrix-cell")).toBeVisible();
}

test("the doc lists what we expect to parse (guards the parser itself)", () => {
  expect(documentedParts.length).toBeGreaterThanOrEqual(20);
  expect(documentedParts).toContain("mp-source-badge");
  expect(documentedRootAttrs).toContain("data-hover");
});

test("Parts list == every mp-* class the player renders across the fixture matrix", async ({ page }) => {
  const rendered = new Set<string>();
  for (const name of Object.keys(fixtures)) {
    await open(page, name);
    const classes = await page.evaluate(() =>
      [...document.querySelectorAll(".mp-root, .mp-root *")].flatMap((e) => [...e.classList].filter((c) => c.startsWith("mp-"))),
    );
    classes.forEach((c) => rendered.add(c));
  }
  expect([...rendered].sort()).toEqual([...documentedParts].sort());
});

test("Root attribute list == every data-* attribute the player sets (incl. data-hover)", async ({ page }) => {
  const rendered = new Set<string>();
  const collect = () =>
    page.evaluate(() => document.querySelector(".mp-root")!.getAttributeNames().filter((n) => n.startsWith("data-")));
  for (const name of Object.keys(fixtures)) {
    await open(page, name);
    (await collect()).forEach((a) => rendered.add(a));
  }
  expect(rendered.has("data-hover"), "data-hover is absent until the pointer is over the player").toBe(false);

  await open(page, "typical / all caps");
  await page.locator(".mp-window").hover();
  await expect(page.locator(".mp-root")).toHaveAttribute("data-hover", "true"); // wait for the re-render
  (await collect()).forEach((a) => rendered.add(a));
  expect([...rendered].sort()).toEqual([...documentedRootAttrs].sort());
});

test("data-hover follows the pointer and clears on leave", async ({ page }) => {
  await open(page, "typical / all caps");
  const root = page.locator(".mp-root");
  await expect(root).not.toHaveAttribute("data-hover", /.*/);
  await page.locator(".mp-window").hover();
  await expect(root).toHaveAttribute("data-hover", "true");
  await page.mouse.move(2, 2);
  await expect(root).not.toHaveAttribute("data-hover", /.*/);
});

test("boolean data-cap-* attributes are present-or-absent, never data-cap-x=\"false\"", async ({ page }) => {
  for (const name of ["typical / all caps", "no capabilities (GSMTC-style: no volume)", "seek only"]) {
    await open(page, name);
    const values = await page.evaluate(() =>
      [...document.querySelector(".mp-root")!.attributes].filter((a) => a.name.startsWith("data-cap-")).map((a) => a.value),
    );
    for (const v of values) expect(v).toBe("true");
  }
});

for (const { id, json } of THEMES) {
  test(`theme.json \`window\` fits every state and is filled by the largest one — ${id}`, async ({ page }) => {
    let maxW = 0;
    let maxH = 0;
    for (const name of Object.keys(fixtures)) {
      await open(page, name, json.layout, id);
      // Hover, not just the default state — a theme may reveal more content on
      // data-hover (T3's collapsed pill) and the window must fit that too, since the
      // native window can't resize itself on hover. A no-op for themes that don't
      // change size on hover.
      await page.locator(".mp-window").hover();
      const box = (await page.locator(".mp-window").boundingBox())!;
      expect(box.width, `${name} (hover): width`).toBeLessThanOrEqual(json.window.width + 1);
      expect(box.height, `${name} (hover): height`).toBeLessThanOrEqual(json.window.height + 1);
      maxW = Math.max(maxW, box.width);
      maxH = Math.max(maxH, box.height);
    }
    // "Filled by the largest" is a looser bound than "fits within" above: Chromium and
    // WebKit measured several px apart on T3's tiny (7–9px) hover-revealed text lines —
    // real cross-engine font-metric variance, not a bug (PLAN.md already flags WebKit
    // here as "not identical to WKWebView, still needs the real-Mac pass"). The ceiling
    // check must stay tight (content overflowing the native window is a real bug on
    // either engine); "how snugly the largest state fills it" tolerates more slack.
    // 12, not 8: a later run measured WebKit's CJK fixture at 81.5px against T3's
    // then-height of 80 (font-metric variance run-to-run, not just engine-to-engine) —
    // 8px wasn't enough headroom once both sources of variance are accounted for.
    const FILL_TOLERANCE = 12;
    expect(maxW, "widest state fills window.width").toBeGreaterThanOrEqual(json.window.width - FILL_TOLERANCE);
    expect(maxH, "tallest state fills window.height").toBeGreaterThanOrEqual(json.window.height - FILL_TOLERANCE);
  });

  test(`${json.layout} layout (${id}): every rendered part has an explicit grid placement (nothing auto-placed)`, async ({
    page,
  }) => {
    for (const name of Object.keys(fixtures)) {
      await open(page, name, json.layout, id);
      const auto = await page.evaluate(() =>
        [...document.querySelector(".mp-window")!.children].flatMap((el) => {
          const s = getComputedStyle(el);
          return s.gridColumnStart === "auto" || s.gridRowStart === "auto" ? [el.className] : [];
        }),
      );
      expect(auto, `${name}: auto-placed parts`).toEqual([]);
    }
  });
}

test("guard: opacity/transform/mask/mix-blend-mode still locked; crop/filter/animation are now theme-authorable (D10 relaxed 2026-09-22)", async ({
  page,
}) => {
  // Explicitly T2, not the default theme (T1 now, since its own "Ring + Depth"
  // redesign puts high-specificity clip-path/animation rules directly on
  // .mp-artwork — those would beat this test's plain, low-specificity hostile
  // selector on ordinary cascade grounds alone, unrelated to whether guard.css
  // is actually still enforcing anything). T2 declares none of the
  // now-authorable properties on .mp-artwork itself, so the hostile
  // stylesheet's low-specificity rule is the only thing competing with guard.
  await open(page, "very light artwork", "card", "t2-artwork");
  await page.addStyleTag({
    content: `
      .mp-artwork { opacity: .2; transform: rotate(9deg); clip-path: circle(30%); mask: linear-gradient(#000, transparent);
                    mix-blend-mode: multiply; filter: blur(8px); border-radius: 50%; animation: x 1s infinite; }
      .mp-source-badge { display: none; visibility: hidden; opacity: 0; }`,
  });
  const art = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector("img.mp-artwork")!);
    return {
      opacity: s.opacity, transform: s.transform, mask: s.mask, blend: s.mixBlendMode,
      clipPath: s.clipPath, filter: s.filter, radius: s.borderTopLeftRadius, animation: s.animationName,
    };
  });
  expect(art).toEqual({
    // still guard-locked
    opacity: "1", transform: "none", mask: "none", blend: "normal",
    // theme/user-authorable since the D10 relaxation — the hostile stylesheet's values took effect
    clipPath: "circle(30%)", filter: "blur(8px)", radius: "50%", animation: "x",
  });
  await expect(page.locator(".mp-source-badge")).toBeVisible();
  expect(await page.locator(".mp-source-badge").evaluate((e) => getComputedStyle(e).opacity)).toBe("1");
});

const CONTROL_SELECTORS = [".mp-btn-prev", ".mp-btn-play", ".mp-btn-next", ".mp-volume-wrap", ".mp-link-out"];

test("D10: interactive controls never overlap the artwork's bounding box", async ({ page }) => {
  // 4 themes × ~19 fixtures × a full page.goto() each is comfortably over the
  // default 30s budget in WebKit (page loads are slower there — same lesson as
  // T1/T2/T3/T4's window-fit tests). test.slow() triples it.
  test.slow();
  for (const { id, json } of THEMES) {
    for (const name of Object.keys(fixtures)) {
      await open(page, name, json.layout, id);
      await page.locator(".mp-window").hover(); // reveal hover-only controls (T3)
      // page.evaluate + getBoundingClientRect, not locator.boundingBox() — the latter
      // waits for actionability/stability and hung indefinitely in WebKit here.
      const overlaps = await page.evaluate((selectors) => {
        const rect = (el: Element) => el.getBoundingClientRect();
        const art = document.querySelector(".mp-artwork");
        if (!art) return []; // idle/error: no artwork rendered
        const a = rect(art);
        const hits: string[] = [];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (!el) continue; // conditional part absent (volume/link-out)
          const b = rect(el);
          const overlap = !(b.right <= a.left || b.left >= a.right || b.bottom <= a.top || b.top >= a.bottom);
          if (overlap) hits.push(sel);
        }
        return hits;
      }, CONTROL_SELECTORS);
      expect(overlaps, `${id} ${name}: overlaps .mp-artwork`).toEqual([]);
    }
  }
});
