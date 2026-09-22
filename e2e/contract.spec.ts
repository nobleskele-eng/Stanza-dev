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
const THEMES = ["t1-default", "t2-artwork"].map((id) => ({
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

const url = (fixture: string, layout = "strip") => `/?fixture=${encodeURIComponent(fixture)}&layout=${layout}`;

async function open(page: Page, fixture: string, layout = "strip") {
  await page.goto(url(fixture, layout));
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
      await open(page, name, json.layout);
      const box = (await page.locator(".mp-window").boundingBox())!;
      expect(box.width, `${name}: width`).toBeLessThanOrEqual(json.window.width + 1);
      expect(box.height, `${name}: height`).toBeLessThanOrEqual(json.window.height + 1);
      maxW = Math.max(maxW, box.width);
      maxH = Math.max(maxH, box.height);
    }
    expect(maxW, "widest state fills window.width").toBeGreaterThanOrEqual(json.window.width - 1);
    expect(maxH, "tallest state fills window.height").toBeGreaterThanOrEqual(json.window.height - 1);
  });

  test(`${json.layout} layout (${id}): every rendered part has an explicit grid placement (nothing auto-placed)`, async ({
    page,
  }) => {
    for (const name of Object.keys(fixtures)) {
      await open(page, name, json.layout);
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

test("guard: a theme/snippet cannot modify artwork or hide the source badge with ordinary declarations", async ({ page }) => {
  await open(page, "very light artwork");
  await page.addStyleTag({
    content: `
      .mp-artwork { opacity: .2; transform: rotate(9deg); clip-path: circle(30%); mask: linear-gradient(#000, transparent);
                    mix-blend-mode: multiply; filter: blur(8px); border-radius: 50%; animation: x 1s infinite; }
      .mp-source-badge { display: none; visibility: hidden; opacity: 0; }`,
  });
  const art = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector("img.mp-artwork")!);
    return {
      opacity: s.opacity, transform: s.transform, clipPath: s.clipPath, filter: s.filter,
      blend: s.mixBlendMode, radius: s.borderTopLeftRadius, animation: s.animationName,
    };
  });
  expect(art).toEqual({ opacity: "1", transform: "none", clipPath: "none", filter: "none", blend: "normal", radius: "4px", animation: "none" });
  await expect(page.locator(".mp-source-badge")).toBeVisible();
  expect(await page.locator(".mp-source-badge").evaluate((e) => getComputedStyle(e).opacity)).toBe("1");
});
