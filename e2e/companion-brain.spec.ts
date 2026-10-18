import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import type { Skin } from "../src/companion/skin";

// The companion's brain running in the Companion lab's live cards (M2 C2), on Playwright's fake clock. It counts the
// DOM's visible changes (one per React commit), which is what costs CPU in the transparent window (C0 spike).

const SKINS: Skin[] = readdirSync(new URL("../companions/", import.meta.url)).map((id) =>
  JSON.parse(readFileSync(new URL(`../companions/${id}/companion.json`, import.meta.url), "utf8")),
);
const BUDGET_PER_MINUTE = 90;
const EDGE = { left: 56, top: 56, width: 248 }; // the lab's mock card (CompanionLab.tsx)

/**
 * Lets React finish what it has queued. React commits through MessageChannel tasks, and Chromium runs DevTools
 * commands ahead of them, so back-to-back clock steps and reads can otherwise see the DOM before React renders.
 * A message posted now queues behind React's; a few hops cover render → effects → render.
 */
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
  await page.goto("/?lab=companion&live");
  await page.locator("[data-lab-live] .mp-companion").first().waitFor();
  await page.clock.pauseAt(1000); // from here on, time moves only when the test moves it
  await settle(page);
  // One record per mutation batch: React commits a pose change as one batch.
  await page.evaluate(() => {
    const w = window as unknown as { petChanges: Record<string, number[]> };
    w.petChanges = {};
    for (const card of document.querySelectorAll("[data-lab-live-skin]")) {
      const id = card.getAttribute("data-lab-live-skin")!;
      w.petChanges[id] = [];
      new MutationObserver(() => w.petChanges[id].push(performance.now())).observe(card.querySelector(".mp-companion")!, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    }
  });
}

/**
 * Advances the fake clock, letting React render between steps. COUNT steps are shorter than any frame (every skin's
 * frames last ≥ 160 ms), so each change gets its own commit and is counted. Big steps are only for checking states or
 * that nothing changes at all: the component's timer chain keeps the brain on time across them, but several changes
 * may land in one commit.
 */
const COUNT = 150;
const COARSE = 2000;
/** For checking that nothing changes at all: any change still shows, even if several land in one commit. */
const QUIET = 30_000;
async function run(page: Page, ms: number, step: number, each?: () => Promise<void>) {
  for (let t = 0; t < ms; t += step) {
    await page.clock.runFor(Math.min(step, ms - t));
    await settle(page);
    if (each && Math.floor((t + step) / 2000) > Math.floor(t / 2000)) await each();
  }
}

const changes = (page: Page) => page.evaluate(() => (window as unknown as { petChanges: Record<string, number[]> }).petChanges);
const states = (page: Page) => page.$$eval("[data-lab-live] .mp-companion", (els) => els.map((e) => e.getAttribute("data-pet-state")));
/** A click as a DOM event: Playwright's own click waits for animation frames, which the paused clock holds. */
async function control(page: Page, name: string) {
  await page.locator(`[data-lab-control="${name}"]`).dispatchEvent("click");
  await settle(page);
}

function busiestMinute(times: number[]): number {
  let most = 0;
  for (let i = 0, j = 0; i < times.length; i++) {
    while (times[i] - times[j] >= 60_000) j++;
    most = Math.max(most, i - j + 1);
  }
  return most;
}

/** Every live creature rests its anchor pixel on the card's top edge, within the edge's length. */
async function expectOnEdge(page: Page) {
  const pets = await page.$$eval("[data-lab-live-skin]", (cards) =>
    cards.map((card) => {
      const pet = card.querySelector(".mp-companion")!;
      const m = new DOMMatrix(getComputedStyle(pet).transform);
      return { id: card.getAttribute("data-lab-live-skin")!, state: pet.getAttribute("data-pet-state")!, left: m.e, top: m.f, mirrored: !!pet.querySelector("g[transform]"), dpr: devicePixelRatio };
    }),
  );
  for (const p of pets) {
    const skin = SKINS.find((s) => s.id === p.id)!;
    const px = Math.round(2 * p.dpr) / p.dpr;
    const a = skin.animations[p.state as keyof Skin["animations"]].anchor ?? skin.anchor;
    const ax = p.mirrored ? skin.grid - 1 - a.x : a.x;
    const anchorLeft = p.left + ax * px;
    expect(anchorLeft, `${p.id} ${p.state}: anchor left of the edge`).toBeGreaterThanOrEqual(EDGE.left - 0.01);
    expect(anchorLeft + px, `${p.id} ${p.state}: anchor right of the edge`).toBeLessThanOrEqual(EDGE.left + EDGE.width + 0.01);
    expect(p.top + (a.y + 1) * px, `${p.id} ${p.state}: not resting on the edge`).toBeCloseTo(EDGE.top, 2);
  }
}

test("while music plays, every creature stays on its edge and within the change budget", async ({ page, browserName }) => {
  // What's counted is React's commits, which don't depend on the engine, and brain.test.ts simulates whole hours.
  // WebKit's slower DevTools round trips make this time-lapse take ~2 min there, so it runs in Chromium only.
  test.skip(browserName === "webkit", "engine-independent time-lapse; Chromium covers it");
  test.setTimeout(180_000);
  await open(page);
  const seen = new Set<string>();
  await run(page, 150_000, COUNT, async () => {
    await expectOnEdge(page);
    for (const s of await states(page)) seen.add(s!);
  });
  for (const [id, times] of Object.entries(await changes(page))) {
    expect(times.length, `${id}: alive`).toBeGreaterThan(20);
    expect(busiestMinute(times), `${id}: busiest minute`).toBeLessThanOrEqual(BUDGET_PER_MINUTE);
  }
  expect([...seen]).toEqual(expect.arrayContaining(["idle", "walk", "sit"]));
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test("pausing: asleep a few seconds later, a few sleepy loops, then no changes at all", async ({ page }) => {
  test.setTimeout(60_000);
  await open(page);
  await run(page, 30_000, COARSE);
  await control(page, "pause");
  await run(page, 2500, COUNT);
  expect(await states(page), "a quick pause doesn't send them to sleep").not.toContain("sleep");
  await run(page, 1000, COUNT);
  expect(await states(page)).toEqual(SKINS.map(() => "sleep"));
  await run(page, 40_000, COARSE); // the sleep loops play out (3 × 8 s at most)
  const before = await changes(page);
  await run(page, 5 * 60_000, QUIET);
  const after = await changes(page);
  for (const id of Object.keys(after)) expect(after[id].length - before[id].length, `${id}: changes while asleep`).toBe(0);
  await expectOnEdge(page);
});

test("play wakes them; a new track makes them react; stop sends them to sleep", async ({ page }) => {
  await open(page);
  await run(page, 5000, COARSE);
  await control(page, "next track");
  await run(page, 100, COUNT);
  expect(await states(page)).toEqual(SKINS.map(() => "react"));
  await control(page, "stop");
  await run(page, 3500, COUNT);
  expect(await states(page)).toEqual(SKINS.map(() => "sleep"));
  await control(page, "next track"); // a new track while asleep: no reaction
  await run(page, 100, COUNT);
  expect(await states(page)).toEqual(SKINS.map(() => "sleep"));
  await control(page, "play");
  await run(page, 100, COUNT);
  expect(await states(page)).toEqual(SKINS.map(() => "wake"));
  await run(page, 3000, COUNT);
  expect(await states(page)).toEqual(SKINS.map(() => "idle"));
  await expectOnEdge(page);
});

test("under reduced motion they hold still poses and never change on their own", async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await run(page, 5 * 60_000, QUIET);
  for (const [id, times] of Object.entries(await changes(page))) expect(times, `${id}: changes`).toEqual([]);
  for (const s of await states(page)) expect(["sit", "idle"]).toContain(s);
  await control(page, "next track");
  await run(page, 1000, COUNT);
  for (const [id, times] of Object.entries(await changes(page))) expect(times, `${id}: reacted under reduced motion`).toEqual([]);
  await control(page, "pause");
  await run(page, 3500, COUNT);
  expect(await states(page)).toEqual(SKINS.map(() => "sleep"));
  for (const [id, times] of Object.entries(await changes(page))) expect(times.length, `${id}: one change, to sleep`).toBe(1);
  await expectOnEdge(page);
});
