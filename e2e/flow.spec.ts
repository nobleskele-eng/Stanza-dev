import { expect, test } from "@playwright/test";
import { CONTRACT_VERSION } from "../src/theme/variant";
import { WCAG_AA_NORMAL, contrastRatio, parseColor, type Rgb } from "../src/theme/contrast";

// Flow backdrop (design round 2, step 4): real text wrapped around T5's two tape reels by native CSS
// `shape-outside`, reflowing live as the reels resize with playback progress.

const url = (fixture: string, theme = "t5-kinetic", fx = "flow") =>
  `/?fixture=${encodeURIComponent(fixture)}&layout=card&theme=${theme}&fx=${fx}`;
const FIXTURE = "typical / all caps";

/** Everything the page-side helpers below need, measured in one evaluate. */
async function measure(page: import("@playwright/test").Page, progress?: number) {
  return page.evaluate((p) => {
    const root = document.querySelector(".mp-root") as HTMLElement;
    if (p !== undefined) root.style.setProperty("--mp-progress", String(p));
    const win = document.querySelector(".mp-window") as HTMLElement;
    const flow = document.querySelector(".mp-flow") as HTMLElement;
    void win.offsetHeight; // force layout
    const wr = win.getBoundingClientRect();
    const reel = (which: "::before" | "::after") => {
      const cs = getComputedStyle(win, which);
      const d = parseFloat(cs.width);
      const left = which === "::before" ? parseFloat(cs.left) : wr.width - parseFloat(cs.right) - d;
      return { d, cx: wr.left + left + d / 2, cy: wr.top + parseFloat(cs.top) + d / 2 };
    };
    const rects: { l: number; r: number; t: number; b: number }[] = [];
    for (const node of flow.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rc of range.getClientRects()) rects.push({ l: rc.left, r: rc.right, t: rc.top, b: rc.bottom });
    }
    return { reels: { left: reel("::before"), right: reel("::after") }, rects, win: { l: wr.left, r: wr.right, t: wr.top, b: wr.bottom } };
  }, progress);
}

type M = Awaited<ReturnType<typeof measure>>;
/** Distance from a point to the nearest point of a rectangle (0 if inside). */
const distToRect = (cx: number, cy: number, r: M["rects"][number]) =>
  Math.hypot(Math.max(r.l - cx, 0, cx - r.r), Math.max(r.t - cy, 0, cy - r.b));
/** Text fragments whose vertical span overlaps the reel's own vertical extent. */
const inBand = (m: M, reel: M["reels"]["left"]) => m.rects.filter((r) => r.b > reel.cy - reel.d / 2 && r.t < reel.cy + reel.d / 2);

test("flow: the layer is decorative, contained, non-interactive, and made only of the real strings", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url(FIXTURE));
  await expect(page.locator(".mp-flow")).toBeAttached();

  const info = await page.evaluate(() => {
    const flow = document.querySelector(".mp-flow") as HTMLElement;
    const win = document.querySelector(".mp-window") as HTMLElement;
    const cs = getComputedStyle(flow);
    const fr = flow.getBoundingClientRect();
    const wr = win.getBoundingClientRect();
    return {
      ariaHidden: flow.getAttribute("aria-hidden"),
      pointerEvents: cs.pointerEvents,
      z: cs.zIndex,
      inside: fr.left >= wr.left - 1 && fr.right <= wr.right + 1 && fr.top >= wr.top - 1 && fr.bottom <= wr.bottom + 1,
      text: flow.textContent ?? "",
      title: document.querySelector(".mp-title")?.textContent ?? "",
      artist: document.querySelector(".mp-artist")?.textContent ?? "",
      album: document.querySelector(".mp-album")?.textContent ?? "",
    };
  });
  expect(info.ariaHidden).toBe("true");
  expect(info.pointerEvents).toBe("none");
  expect(info.z).toBe("-2");
  expect(info.inside).toBe(true);
  // Remove every real string; only separators (dots and spaces) may remain: no invented words.
  let rest = info.text;
  for (const real of [info.title, info.artist, info.album]) rest = rest.split(real).join("");
  expect(rest.replace(/[\s·]/g, "")).toBe("");
  expect(errors).toEqual([]);
});

test("flow: text really wraps around both reels — no line fragment touches a reel, and text sits right beside them", async ({ page }) => {
  await page.goto(url(FIXTURE));
  await expect(page.locator(".mp-flow")).toBeAttached();
  for (const p of [0.2, 0, 1]) {
    const m = await measure(page, p);
    expect(m.rects.length).toBeGreaterThan(20);
    for (const [name, reel] of Object.entries(m.reels)) {
      for (const r of m.rects) {
        expect(distToRect(reel.cx, reel.cy, r), `${name} reel at progress ${p}`).toBeGreaterThanOrEqual(reel.d / 2 - 0.5);
      }
      // Not merely avoided by leaving the area empty: there IS text in the reel's own vertical band.
      expect(inBand(m, reel).length, `${name} reel band at progress ${p}`).toBeGreaterThan(0);
    }
  }
});

test("flow: it is the circle shape doing the wrapping, not just the floated boxes (text tucks into the corners)", async ({ page }) => {
  await page.goto(url(FIXTURE));
  await expect(page.locator(".mp-flow")).toBeAttached();
  const tucked = async () => {
    const m = await measure(page, 0); // left reel at its biggest: the corner effect is largest
    const { cx, cy, d } = m.reels.left;
    const boxRight = cx + d / 2 + 10; // the float box edge
    return inBand(m, m.reels.left).filter((r) => r.l < boxRight - 6).length;
  };
  expect(await tucked()).toBeGreaterThan(0);
  // Mutation check: with shape-outside removed the same lines stop at the box edge, so this test
  // would fail if the circle stopped being applied.
  await page.addStyleTag({ content: ".mp-flow > i { shape-outside: none !important; }" });
  // WebKit does not re-run float line layout when only `shape-outside` changes on an already laid-out
  // float (measured: identical line positions before/after), so force a fresh layout of the layer.
  await page.evaluate(() => {
    const f = document.querySelector(".mp-flow") as HTMLElement;
    f.style.display = "none";
    void f.offsetHeight;
    f.style.display = "";
  });
  expect(await tucked()).toBe(0);
});

test("flow: the wrap reflows live as the reels resize with progress", async ({ page }) => {
  await page.goto(url(FIXTURE));
  await expect(page.locator(".mp-flow")).toBeAttached();
  const start = await measure(page, 0); // left reel biggest, right smallest
  const end = await measure(page, 1); // opposite
  expect(start.reels.left.d).toBeGreaterThan(end.reels.left.d + 40);
  expect(end.reels.right.d).toBeGreaterThan(start.reels.right.d + 40);
  // Nearest text to the left reel's centre-line moves inward as that reel shrinks.
  const leftEdge = (m: M) => Math.min(...inBand(m, m.reels.left).filter((r) => r.b > m.reels.left.cy && r.t < m.reels.left.cy).map((r) => r.l));
  expect(leftEdge(start)).toBeGreaterThan(leftEdge(end) + 10);
});

test("flow: cost of a reflow is small (measured; generous ceiling only to catch pathologies)", async ({ page }) => {
  await page.goto(url(FIXTURE));
  await expect(page.locator(".mp-flow")).toBeAttached();
  const ms = await page.evaluate(() => {
    const root = document.querySelector(".mp-root") as HTMLElement;
    const win = document.querySelector(".mp-window") as HTMLElement;
    const t: number[] = [];
    for (let i = 0; i < 200; i++) {
      const s = performance.now();
      root.style.setProperty("--mp-progress", String((i % 100) / 100));
      void win.offsetHeight;
      t.push(performance.now() - s);
    }
    return t.reduce((a, b) => a + b, 0) / t.length;
  });
  console.log(`flow reflow avg ${ms.toFixed(3)} ms per progress change`);
  expect(ms).toBeLessThan(8); // half a 60 fps frame
});

test("flow: muted/foreground text stays AA on the worst-case backdrop (background blended with the flow's own alpha)", async ({ page }) => {
  await page.goto(url(FIXTURE));
  await expect(page.locator(".mp-flow")).toBeAttached();
  const d = await page.evaluate(() => {
    const root = document.querySelector(".mp-root") as HTMLElement;
    const cs = getComputedStyle(root);
    const color = (sel: string) => (document.querySelector(sel) ? getComputedStyle(document.querySelector(sel)!).color : null);
    return {
      bg: getComputedStyle(document.querySelector(".mp-window")!).backgroundColor,
      fg: cs.getPropertyValue("--mp-fg").trim(),
      alpha: parseFloat(cs.getPropertyValue("--t5-flow-alpha")) / 100,
      parts: [".mp-title", ".mp-artist", ".mp-album", ".mp-time-current", ".mp-time-total", ".mp-source-badge"].map((s) => [s, color(s)] as const),
    };
  });
  const bg = parseColor(d.bg)!;
  const fg = parseColor(d.fg)!;
  expect(bg && fg).toBeTruthy();
  const blended = bg.map((c, i) => Math.round(c + (fg[i] - c) * d.alpha)) as Rgb;
  for (const [sel, col] of d.parts) {
    if (!col) continue;
    const rgb = parseColor(col)!;
    expect(contrastRatio(rgb, blended), `${sel} on blended backdrop`).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
  }
});

test("flow: an unthemed layer is invisible (only T5 styles it), and window size is unaffected", async ({ page }) => {
  await page.goto(url(FIXTURE, "t2-artwork", ""));
  await expect(page.locator(".mp-window")).toBeVisible();
  const off = await page.locator(".mp-window").evaluate((e) => [e.clientWidth, e.clientHeight]);
  await page.goto(url(FIXTURE, "t2-artwork", "flow"));
  await expect(page.locator(".mp-flow")).toBeAttached();
  expect(await page.locator(".mp-flow").evaluate((e) => getComputedStyle(e).color)).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  expect(await page.locator(".mp-window").evaluate((e) => [e.clientWidth, e.clientHeight])).toEqual(off);
});

test("flow: T5 ships it on by default in the harness, and a variant can switch it on/off", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("typical / all caps").check();
  await page.getByLabel(/t5-kinetic/).check();
  await expect(page.locator(".mp-root")).toHaveAttribute("data-fx-flow", "true");
  await page.locator("textarea").fill(JSON.stringify({ theme: "t5-kinetic", contract: CONTRACT_VERSION, layout: "card", effects: { title: "typewriter" } }));
  await page.getByRole("button", { name: "apply variant" }).click();
  await expect(page.getByTestId("variant-report")).toHaveText("ok");
  await expect(page.locator(".mp-root")).not.toHaveAttribute("data-fx-flow", /.*/); // the variant replaces the defaults
});
