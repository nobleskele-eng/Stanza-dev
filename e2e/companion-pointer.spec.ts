import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Picking the companion up, carrying it, dropping it and clicking it (M2 C4a), in the Companion lab's cards that travel
// the whole outline, on Playwright's fake clock. Positions come from the inline transform the app set, not from layout
// reads: Playwright's WebKit reported stale positions for a moved pet (DECISIONS.md, C3b).

const SKINS = ["test-dummy", "pilcrow", "bookworm", "cassette"];
const EPS = 0.01;
/** The art row a pose rests on its surface by (the skin's per-animation anchor, else its own). */
const anchorRow = (id: string, state: string) => {
  const skin = JSON.parse(readFileSync(new URL(`../companions/${id}/companion.json`, import.meta.url), "utf8"));
  return (skin.animations[state].anchor ?? skin.anchor).y as number;
};

/** Lets React finish what it has queued (see companion-brain.spec.ts: DevTools commands overtake React's commits). */
const settle = (page: Page) =>
  page.evaluate(async () => {
    for (let i = 0; i < 4; i++)
      await new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = resolve;
        channel.port2.postMessage(0);
      });
  });

/** The lab section the helpers read: the cards that travel the outline, or the taller ones with a shelf (C5a). */
let section: "around" | "shelf" = "around";

async function open(page: Page, which: typeof section = "around") {
  section = which;
  await page.clock.install({ time: 0 });
  await page.goto(`/?lab=companion&${which}`);
  await page.locator(`[data-lab-${which}] .mp-companion`).first().waitFor();
  // From here on, time moves only when the test moves it: at 1 s, or just after now if the dev server was slow to load
  // the page (it can be, right after an edit: pausing in the past throws, DECISIONS.md C5a).
  await page.clock.pauseAt(Math.max(1000, (await page.evaluate(() => Date.now())) + 100));
  await settle(page);
}

async function run(page: Page, ms: number, step = 50) {
  for (let t = 0; t < ms; t += step) {
    await page.clock.runFor(step);
    await settle(page);
  }
}

type Box = { left: number; top: number; right: number; bottom: number };

/** One creature: its state, its sprite box, every drawn pixel (page px), its mock card and the card's artwork. */
const pet = (page: Page, id: string) =>
  page.evaluate(([id, section]) => {
    const scene = document.querySelector(`[data-lab-${section}-skin="${id}"]`)!;
    const s = scene.getBoundingClientRect();
    const face = scene.firstElementChild!.getBoundingClientRect();
    const art = scene.querySelector("[data-lab-art]")!.getBoundingClientRect();
    const el = scene.querySelector<HTMLElement>(".mp-companion")!;
    const [x, y] = (/translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform) ?? []).slice(1).map(Number);
    const svg = el.querySelector("svg")!;
    const size = svg.width.baseVal.value;
    const px = size / svg.viewBox.baseVal.width;
    const mirror = /translate\((\d+)/.exec(svg.querySelector("g")!.getAttribute("transform") ?? "");
    const left = s.left + x;
    const top = s.top + y;
    const pixels: { left: number; top: number; right: number; bottom: number }[] = [];
    for (const path of svg.querySelectorAll("path"))
      for (const [, xs, ys, ws] of path.getAttribute("d")!.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
        const w = Number(ws);
        const col = mirror ? Number(mirror[1]) - Number(xs) - w : Number(xs);
        pixels.push({ left: left + col * px, top: top + Number(ys) * px, right: left + (col + w) * px, bottom: top + (Number(ys) + 1) * px });
      }
    return {
      state: el.getAttribute("data-pet-state")!,
      surface: el.getAttribute("data-pet-surface")!,
      noDrag: el.hasAttribute("data-no-drag"),
      pointer: getComputedStyle(el).pointerEvents,
      center: { x: left + size / 2, y: top + size / 2 },
      size,
      /** The sprite box's top and an art pixel's size, page px: where its anchor row is. */
      boxTop: top,
      px,
      pixels,
      card: { left: face.left, top: face.top, right: face.right, bottom: face.bottom },
      art: { left: art.left, top: art.top, right: art.right, bottom: art.bottom },
      parts: [...scene.querySelectorAll("[data-lab-art], [data-lab-bar], [data-lab-badge]")].map((e) => {
        const r = e.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }),
      shelfLine: scene.querySelector("[data-lab-shelf-line]")?.getBoundingClientRect().top ?? null,
    };
  }, [id, section] as const);

const off = (p: Box, b: Box) => p.right <= b.left + EPS || p.left >= b.right - EPS || p.bottom <= b.top + EPS || p.top >= b.bottom - EPS;

/**
 * Every drawn pixel off the artwork (CLAUDE.md: nothing interactive over it) and within the card and a sprite's box
 * around it (the room it's carried in). Says whether any pixel is over the card, which it may be in the air.
 */
async function expectClear(page: Page, id: string, what: string) {
  const p = await pet(page, id);
  const room = { left: p.card.left - p.size, top: p.card.top - p.size, right: p.card.right + p.size, bottom: p.card.bottom + p.size };
  for (const px of p.pixels) {
    expect(off(px, p.art), `${id} ${what}: a pixel over the artwork`).toBe(true);
    expect(px.left >= room.left - EPS && px.right <= room.right + EPS && px.top >= room.top - EPS && px.bottom <= room.bottom + EPS, `${id} ${what}: out of its room`).toBe(true);
  }
  return { ...p, overCard: p.pixels.some((px) => !off(px, p.card)) };
}

/** Lets the dropped creature fall, 40 ms at a time, checking every step, until it's in `until`; the states it showed. */
async function fallUntil(page: Page, id: string, until: string) {
  const seen: Awaited<ReturnType<typeof expectClear>>[] = [];
  for (let t = 0; t < 3000; t += 40) {
    const p = await expectClear(page, id, `falling (${t} ms)`);
    seen.push(p);
    if (p.state === until) break;
    await run(page, 40, 40);
  }
  return seen;
}

/** Presses on the creature and moves the pointer far enough to pick it up. */
async function pickUp(page: Page, id: string) {
  const { center } = await pet(page, id);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 6, center.y - 4, { steps: 3 });
  await settle(page);
}

test("it takes the pointer in the lab: grab cursor, and the window drag leaves it alone", async ({ page }) => {
  await open(page);
  for (const id of SKINS) {
    const p = await pet(page, id);
    expect(p.pointer, id).toBe("auto");
    expect(p.noDrag, `${id}: data-no-drag`).toBe(true);
  }
});

test("picked up, it's carried over the card but never the artwork; dropped above the top, it falls and lands there", async ({ page }) => {
  await open(page);
  for (const id of SKINS) {
    await pickUp(page, id);
    expect((await pet(page, id)).state, id).toBe("held");
    expect((await pet(page, id)).surface, id).toBe("air");
    const { card, art } = await pet(page, id);
    // Over the card's right part (it may be over the card), over the artwork's middle and corner (pushed off it), out
    // past the room's corner (held in), then above the top's middle.
    const across: [number, number, boolean?][] = [
      [card.right - 60, (card.top + card.bottom) / 2, true],
      [(art.left + art.right) / 2, (art.top + art.bottom) / 2],
      [art.left + 4, art.top + 4],
      [card.left - 60, card.top - 60],
      [(card.left + card.right) / 2, card.top - 20],
    ];
    for (const [x, y, overCard] of across) {
      await page.mouse.move(x, y, { steps: 4 });
      await settle(page);
      const p = await expectClear(page, id, `carried to (${x}, ${y})`);
      if (overCard) expect(p.overCard, `${id}: carried over the card`).toBe(true);
    }
    await page.mouse.up();
    await settle(page);
    const seen = new Set((await fallUntil(page, id, "idle")).map((p) => p.state));
    const landed = await pet(page, id);
    expect(landed, id).toMatchObject({ state: "idle", surface: "top" });
    expect(seen, `${id}: it landed`).toContain("land");
    // Standing on the top's line, over the middle where it was dropped.
    expect(Math.max(...landed.pixels.map((p) => p.bottom)), id).toBeCloseTo(landed.card.top, 2);
    expect(Math.abs(landed.center.x - (card.left + card.right) / 2 - 6), `${id}: where it was let go`).toBeLessThan(landed.size);
  }
});

test("dropped over the card, it falls down the card's face and catches the bottom edge", async ({ page }) => {
  await open(page);
  for (const id of SKINS) {
    const { card } = await pet(page, id);
    await pickUp(page, id);
    await page.mouse.move(card.right - 60, card.top + 30, { steps: 4 });
    await page.mouse.up();
    await settle(page);
    const frames = await fallUntil(page, id, "hang");
    expect(frames.filter((p) => p.state === "fall").length, `${id}: a real fall`).toBeGreaterThan(3);
    expect(frames.some((p) => p.state === "fall" && p.overCard), `${id}: down the card's face`).toBe(true);
    const hung = frames.at(-1)!;
    expect(hung, id).toMatchObject({ state: "hang", surface: "bottom" });
    expect(Math.min(...hung.pixels.map((p) => p.top)), `${id}: touches the bottom`).toBeCloseTo(card.bottom, 2);
    expect(Math.abs(hung.center.x - (card.right - 60 + 6)), `${id}: below where it was let go`).toBeLessThan(hung.size);
  }
});

test("dropped onto the artwork, it slides off its edge and falls on past it", async ({ page }) => {
  await open(page);
  for (const id of SKINS) {
    const { art } = await pet(page, id);
    await pickUp(page, id);
    // At the artwork's top edge: pushed up off it, feet just above it, lower than the top's reach.
    await page.mouse.move((art.left + art.right) / 2, art.top + 2, { steps: 4 });
    await settle(page);
    expect((await expectClear(page, id, "held above the artwork")).state, id).toBe("held");
    await page.mouse.up();
    await settle(page);
    const frames = await fallUntil(page, id, "hang");
    // Every frame cleared the artwork (fallUntil checks), and it got lower than the artwork's top: it went around it.
    expect(frames.some((p) => p.state === "fall" && Math.max(...p.pixels.map((px) => px.bottom)) > art.top + 8), `${id}: past the artwork`).toBe(true);
    expect(frames.at(-1), id).toMatchObject({ state: "hang", surface: "bottom" });
  }
});

test("dropped beside a side it clings there at once; dropped under the card it hangs from the bottom", async ({ page }) => {
  await open(page);
  for (const id of SKINS) {
    const { card } = await pet(page, id);
    // Far enough out that no drawn pixel is over the card (the room holds it in): beside the card, not over it.
    await pickUp(page, id);
    await page.mouse.move(card.left - 22, (card.top + card.bottom) / 2, { steps: 4 });
    await page.mouse.up();
    await settle(page);
    const side = await expectClear(page, id, "on the left side");
    expect(side, id).toMatchObject({ state: "climb", surface: "left" });
    expect(Math.max(...side.pixels.map((p) => p.right)), `${id}: touches the side`).toBeCloseTo(card.left, 2);

    await pickUp(page, id);
    await page.mouse.move((card.left + card.right) / 2, card.bottom + 22, { steps: 4 });
    await page.mouse.up();
    await settle(page);
    const under = await expectClear(page, id, "under the bottom");
    expect(under, id).toMatchObject({ state: "hang", surface: "bottom" });
    expect(Math.min(...under.pixels.map((p) => p.top)), `${id}: touches the bottom`).toBeCloseTo(card.bottom, 2);
  }
});

test("a click makes it react; asleep, it stirs and goes back to sleep", async ({ page }) => {
  await open(page);
  for (const id of SKINS) {
    const { center, state } = await pet(page, id);
    expect(state, `${id}: idling on the top to begin with`).toBe("idle");
    await page.mouse.click(center.x, center.y);
    await settle(page);
    expect((await pet(page, id)).state, id).toBe("react");
  }
  await page.locator('[data-lab-control="pause"]').dispatchEvent("click");
  await run(page, 60_000, 1000); // asleep, through its loops, then still
  for (const id of SKINS) {
    const { center, state } = await pet(page, id);
    expect(state, id).toBe("sleep");
    await page.mouse.click(center.x, center.y);
    await settle(page);
    expect((await pet(page, id)).state, id).toBe("wake");
  }
  await run(page, 2000);
  for (const id of SKINS) expect((await pet(page, id)).state, `${id}: back to sleep`).toBe("sleep");
});

test("dropped above the shelf (C5a), it falls onto it and lives there, over no part", async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, "shelf");
  for (const id of SKINS) {
    await pickUp(page, id);
    const { card, shelfLine } = await pet(page, id);
    expect(shelfLine, "the lab draws its shelf").not.toBeNull();
    // Above the shelf's middle, clear of the artwork above it.
    await page.mouse.move(card.left + 40, shelfLine! - 40, { steps: 4 });
    await settle(page);
    await page.mouse.up();
    await settle(page);
    const fell = await fallUntil(page, id, "land");
    expect(fell.some((p) => p.state === "fall"), `${id}: a real fall`).toBe(true);
    const landed = fell.at(-1)!;
    expect([landed.state, landed.surface], id).toEqual(["land", "shelf"]);
    // Standing on the shelf's line, and for a while after: no pixel over a part. Problems are collected and asserted
    // once: an expect() per pixel per part (Playwright records each as a step) timed this out in WebKit.
    const wrong: string[] = [];
    for (let t = 0; t < 20_000; t += 500) {
      const p = await pet(page, id);
      if (p.surface !== "shelf") break; // it may step out at the door
      if (p.pixels.some((px) => p.parts.some((part) => !off(px, part)))) wrong.push(`${t} ms, ${p.state}: a pixel over a part`);
      const anchor = p.boxTop + (anchorRow(id, p.state) + 1) * p.px;
      if (Math.abs(anchor - shelfLine!) > EPS) wrong.push(`${t} ms, ${p.state}: its anchor ${anchor} isn't on the shelf's line ${shelfLine}`);
      await run(page, 500, 500);
    }
    expect(wrong, id).toEqual([]);
  }
});
