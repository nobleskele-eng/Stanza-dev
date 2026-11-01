import { expect, test, type Page } from "@playwright/test";

// Picking the companion up, carrying it, dropping it and clicking it (M2 C4a), in the Companion lab's cards that travel
// the whole outline, on Playwright's fake clock. Positions come from the inline transform the app set, not from layout
// reads: Playwright's WebKit reported stale positions for a moved pet (DECISIONS.md, C3b).

const SKINS = ["test-dummy", "pilcrow", "bookworm", "cassette"];
const EPS = 0.01;

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

async function open(page: Page) {
  await page.clock.install({ time: 0 });
  await page.goto("/?lab=companion&around");
  await page.locator("[data-lab-around] .mp-companion").first().waitFor();
  await page.clock.pauseAt(1000); // from here on, time moves only when the test moves it
  await settle(page);
}

async function run(page: Page, ms: number, step = 50) {
  for (let t = 0; t < ms; t += step) {
    await page.clock.runFor(step);
    await settle(page);
  }
}

type Box = { left: number; top: number; right: number; bottom: number };

/** One creature: its state, its sprite box, every drawn pixel (page px), its mock card and the room around it. */
const pet = (page: Page, id: string) =>
  page.evaluate((id) => {
    const scene = document.querySelector(`[data-lab-around-skin="${id}"]`)!;
    const s = scene.getBoundingClientRect();
    const face = scene.firstElementChild!.getBoundingClientRect();
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
      pixels,
      card: { left: face.left, top: face.top, right: face.right, bottom: face.bottom },
    };
  }, id);

const offCard = (p: Box, card: Box) => p.right <= card.left + EPS || p.left >= card.right - EPS || p.bottom <= card.top + EPS || p.top >= card.bottom - EPS;

/** Every drawn pixel off the card and within a sprite's box around it (the room it's carried in). */
async function expectOffCard(page: Page, id: string, what: string) {
  const p = await pet(page, id);
  const room = { left: p.card.left - p.size, top: p.card.top - p.size, right: p.card.right + p.size, bottom: p.card.bottom + p.size };
  for (const px of p.pixels) {
    expect(offCard(px, p.card), `${id} ${what}: a pixel over the card`).toBe(true);
    expect(px.left >= room.left - EPS && px.right <= room.right + EPS && px.top >= room.top - EPS && px.bottom <= room.bottom + EPS, `${id} ${what}: out of its room`).toBe(true);
  }
  return p;
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

test("picked up, it dangles off the card wherever it's carried; dropped above the top, it falls and lands there", async ({ page }) => {
  await open(page);
  for (const id of SKINS) {
    await pickUp(page, id);
    expect((await pet(page, id)).state, id).toBe("held");
    expect((await pet(page, id)).surface, id).toBe("air");
    const { card } = await pet(page, id);
    // Across the card's middle and its corners: it's pushed out to the room around the card, never over it.
    const across: [number, number][] = [
      [(card.left + card.right) / 2, (card.top + card.bottom) / 2],
      [card.left + 4, card.top + 4],
      [card.right - 4, card.bottom - 4],
      [card.left - 60, card.top - 60],
      [(card.left + card.right) / 2, card.top - 20],
    ];
    for (const [x, y] of across) {
      await page.mouse.move(x, y, { steps: 4 });
      await settle(page);
      await expectOffCard(page, id, `carried to (${x}, ${y})`);
    }
    await page.mouse.up();
    await settle(page);
    expect(["fall", "land"], id).toContain((await pet(page, id)).state);
    const seen = new Set<string>();
    for (let t = 0; t < 1000; t += 40) {
      await run(page, 40, 40);
      const p = await expectOffCard(page, id, "falling and landing");
      seen.add(p.state);
      if (p.state === "idle") break;
    }
    const landed = await pet(page, id);
    expect(landed, id).toMatchObject({ state: "idle", surface: "top" });
    expect(seen, `${id}: it landed`).toContain("land");
    // Standing on the top's line, over the middle where it was dropped.
    expect(Math.max(...landed.pixels.map((p) => p.bottom)), id).toBeCloseTo(landed.card.top, 2);
    expect(Math.abs(landed.center.x - (card.left + card.right) / 2 - 6), `${id}: where it was let go`).toBeLessThan(landed.size);
  }
});

test("dropped beside a side it clings there; dropped under the card it hangs from the bottom", async ({ page }) => {
  await open(page);
  for (const id of SKINS) {
    const { card } = await pet(page, id);
    await pickUp(page, id);
    await page.mouse.move(card.left - 14, (card.top + card.bottom) / 2, { steps: 4 });
    await page.mouse.up();
    await settle(page);
    const side = await expectOffCard(page, id, "on the left side");
    expect(side, id).toMatchObject({ state: "climb", surface: "left" });
    expect(Math.max(...side.pixels.map((p) => p.right)), `${id}: touches the side`).toBeCloseTo(card.left, 2);

    await pickUp(page, id);
    await page.mouse.move((card.left + card.right) / 2, card.bottom + 14, { steps: 4 });
    await page.mouse.up();
    await settle(page);
    const under = await expectOffCard(page, id, "under the bottom");
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
