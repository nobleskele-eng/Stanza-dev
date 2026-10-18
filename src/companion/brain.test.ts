import { describe, expect, it } from "vitest";
import { BUDGET_PER_MINUTE, DROWSY_MS, SLEEP_LOOPS, advance, createBrain, nextChangeAt, pose, setWorld, trackChanged, type Brain, type Pose, type World } from "./brain";
import { SKINS } from "./registry";
import type { Skin } from "./skin";

const MINUTE = 60_000;
const playing: World = { playing: true, reducedMotion: false, edge: { length: 160, noSit: [] } };
const paused: World = { ...playing, playing: false };
const key = (p: Pose) => `${p.animation}/${p.frame}/${p.x}/${p.facing}`;

interface Run {
  brain: Brain;
  /** Every visible change: when, and the pose it showed. */
  changes: { t: number; pose: Pose }[];
}

/** Runs the brain from `from` to `to` exactly as the component would: one timer for the next due change. */
function run(skin: Skin, world: World, brain: Brain, from: number, to: number): Run {
  let b = brain;
  const changes: Run["changes"] = [];
  let shown = key(pose(b));
  let t = from;
  for (;;) {
    const at = nextChangeAt(b, skin, world);
    if (at === null || at > to) break;
    expect(at, "a due time never goes backwards").toBeGreaterThanOrEqual(t);
    t = at;
    b = advance(b, skin, world, at);
    if (key(pose(b)) !== shown) {
      shown = key(pose(b));
      changes.push({ t: at, pose: pose(b) });
    }
  }
  return { brain: b, changes };
}

/** The most changes in any window of a minute. */
function busiestMinute(times: number[]): number {
  let most = 0;
  for (let i = 0, j = 0; i < times.length; i++) {
    while (times[i] - times[j] >= MINUTE) j++;
    most = Math.max(most, i - j + 1);
  }
  return most;
}

const skins = Object.values(SKINS);

describe("companion brain", () => {
  it("is deterministic for a seed, and different seeds behave differently", () => {
    const skin = SKINS.pilcrow;
    const a = run(skin, playing, createBrain(skin, playing, 0, 7), 0, 10 * MINUTE).changes.map((c) => `${c.t}:${key(c.pose)}`);
    const b = run(skin, playing, createBrain(skin, playing, 0, 7), 0, 10 * MINUTE).changes.map((c) => `${c.t}:${key(c.pose)}`);
    const c = run(skin, playing, createBrain(skin, playing, 0, 8), 0, 10 * MINUTE).changes.map((c) => `${c.t}:${key(c.pose)}`);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  for (const skin of skins) {
    it(`${skin.id}: an hour of music stays within the change budget, on the edge, and does everything`, () => {
      const world: World = { ...playing, edge: { length: 160, noSit: [[40, 60]] } };
      for (const seed of [1, 2, 3]) {
        const { changes } = run(skin, world, createBrain(skin, world, 0, seed), 0, 60 * MINUTE);
        const times = changes.map((c) => c.t);
        expect(busiestMinute(times), `seed ${seed}: busiest minute`).toBeLessThanOrEqual(BUDGET_PER_MINUTE);
        expect(times.length / 60, `seed ${seed}: changes per minute on average`).toBeLessThan(BUDGET_PER_MINUTE);
        for (const { pose: p } of changes) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThan(160);
          if (p.animation === "sit") expect(p.x < 40 || p.x > 60, `seed ${seed}: sat at ${p.x}, over a part`).toBe(true);
        }
        const seen = new Set(changes.map((c) => c.pose.animation));
        for (const mode of ["idle", "walk", "sit"]) expect(seen, `seed ${seed}`).toContain(mode);
        const facings = new Set(changes.filter((c) => c.pose.animation === "walk").map((c) => c.pose.facing));
        expect(facings.size, `seed ${seed}: walks both ways`).toBe(2);
      }
    });
  }

  it("the budget, not the art, sets the ceiling: a skin that blinks every 100 ms still stays within it", () => {
    const frantic: Skin = JSON.parse(JSON.stringify(SKINS.pilcrow));
    for (const name of ["idle", "sit", "sleep"] as const) frantic.animations[name].durations = frantic.animations[name].frames.map(() => 100);
    const { changes } = run(frantic, playing, createBrain(frantic, playing, 0, 1), 0, 30 * MINUTE);
    const busiest = busiestMinute(changes.map((c) => c.t));
    expect(busiest).toBeLessThanOrEqual(BUDGET_PER_MINUTE);
    expect(busiest, "the budget is what held it back").toBeGreaterThan(BUDGET_PER_MINUTE - 5);
  });

  it("walks by the skin's steps: the bookworm inches (head planted, then 4 px)", () => {
    const skin = SKINS.bookworm;
    const { changes } = run(skin, playing, createBrain(skin, playing, 0, 3), 0, 20 * MINUTE);
    const walk = changes.filter((c, i) => c.pose.animation === "walk" && changes[i - 1]?.pose.animation === "walk");
    expect(walk.length).toBeGreaterThan(10);
    for (let i = 0; i < walk.length; i++) {
      const prev = changes[changes.indexOf(walk[i]) - 1].pose;
      const moved = Math.abs(walk[i].pose.x - prev.x);
      // Entering the arch (frame 1) moves nothing; entering the dash (frame 0) moves 4, unless the edge stops it.
      if (walk[i].pose.frame === 1) expect(moved).toBe(0);
      else expect(moved === 4 || walk[i].pose.x === 0 || walk[i].pose.x === 159).toBe(true);
    }
  });

  it("falls asleep a few seconds after the music stops, sleeps a few loops, then holds still", () => {
    for (const skin of skins) {
      const awake = run(skin, playing, createBrain(skin, playing, 0, 5), 0, MINUTE).brain;
      const stopped = setWorld(awake, skin, playing, paused, MINUTE);
      const { changes, brain } = run(skin, paused, stopped, MINUTE, 3 * MINUTE);
      const asleep = changes.find((c) => c.pose.animation === "sleep")!;
      expect(asleep.t, skin.id).toBe(MINUTE + DROWSY_MS);
      const sleepFrames = skin.animations.sleep.frames.length;
      expect(changes.filter((c) => c.t > asleep.t).length, skin.id).toBe(SLEEP_LOOPS * sleepFrames);
      expect(pose(brain).frame, skin.id).toBe(0);
      expect(nextChangeAt(brain, skin, paused), `${skin.id}: still until something happens`).toBeNull();
    }
  });

  it("a short pause doesn't send it to sleep", () => {
    const skin = SKINS.cassette;
    const awake = run(skin, playing, createBrain(skin, playing, 0, 5), 0, MINUTE).brain;
    const b = setWorld(awake, skin, playing, paused, MINUTE);
    const mid = run(skin, paused, b, MINUTE, MINUTE + DROWSY_MS - 1);
    const resumed = setWorld(mid.brain, skin, paused, playing, MINUTE + DROWSY_MS - 1);
    const after = run(skin, playing, resumed, MINUTE + DROWSY_MS - 1, 3 * MINUTE);
    expect([...mid.changes, ...after.changes].some((c) => c.pose.animation === "sleep")).toBe(false);
  });

  it("wakes when the music starts again, then carries on", () => {
    const skin = SKINS.pilcrow;
    const asleep = createBrain(skin, paused, 0, 9);
    const b = setWorld(run(skin, paused, asleep, 0, 5 * MINUTE).brain, skin, paused, playing, 5 * MINUTE);
    expect(pose(b).animation).toBe("wake");
    const { changes } = run(skin, playing, b, 5 * MINUTE, 6 * MINUTE);
    const wakeEnd = changes.findIndex((c) => c.pose.animation !== "wake");
    expect(changes[wakeEnd].pose.animation).toBe("idle");
  });

  it("reacts to a new track while awake, and not while asleep", () => {
    const skin = SKINS.bookworm;
    const awake = run(skin, playing, createBrain(skin, playing, 0, 4), 0, MINUTE).brain;
    const reacting = trackChanged(awake, skin, playing, MINUTE);
    expect(pose(reacting)).toMatchObject({ animation: "react", frame: 0 });
    const { changes } = run(skin, playing, reacting, MINUTE, 2 * MINUTE);
    expect(changes.find((c) => c.pose.animation !== "react")!.pose.animation).toBe("idle");

    const asleep = run(skin, paused, createBrain(skin, paused, 0, 4), 0, MINUTE).brain;
    expect(trackChanged(asleep, skin, paused, MINUTE)).toBe(asleep);
  });

  it("under reduced motion it holds still poses and never changes on its own", () => {
    for (const skin of skins) {
      const world: World = { ...playing, reducedMotion: true, edge: { length: 160, noSit: [] } };
      const b = createBrain(skin, world, 0, 2);
      expect(pose(b)).toMatchObject({ animation: "sit", frame: 0 });
      expect(nextChangeAt(b, skin, world), skin.id).toBeNull();
      expect(trackChanged(b, skin, world, 10)).toBe(b);
      const quiet: World = { ...world, playing: false };
      const stopped = setWorld(b, skin, world, quiet, 1000);
      const { changes, brain } = run(skin, quiet, stopped, 1000, 60 * MINUTE);
      expect(changes.map((c) => key(c.pose)), skin.id).toEqual([`sleep/0/${b.x}/${b.facing}`]);
      expect(nextChangeAt(brain, skin, quiet)).toBeNull();
    }
  });

  it("keeps to a shrinking edge, and stands up where its legs would hang over a part", () => {
    const skin = SKINS.pilcrow;
    const wide: World = { ...playing, reducedMotion: true, edge: { length: 160, noSit: [] } };
    let b = createBrain(skin, wide, 0, 11);
    b = { ...b, x: 150 };
    const narrow: World = { ...wide, edge: { length: 100, noSit: [[90, 99]] } };
    const after = setWorld(b, skin, wide, narrow, 5000);
    expect(pose(after)).toMatchObject({ x: 99, animation: "idle" });
    expect(after.changes.length).toBeGreaterThan(0);
  });
});
