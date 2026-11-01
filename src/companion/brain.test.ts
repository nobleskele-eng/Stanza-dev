import { describe, expect, it } from "vitest";
import {
  BUDGET_PER_MINUTE,
  DROWSY_MS,
  FALL_TICK_MS,
  SLEEP_LOOPS,
  advance,
  carry,
  createBrain,
  drop,
  nextChangeAt,
  pickUp,
  poke,
  pose,
  setWorld,
  trackChanged,
  type Brain,
  type Landing,
  type Pose,
  type World,
} from "./brain";
import { SKINS } from "./registry";
import { MAX_STEP, stepPx, type Skin } from "./skin";

const MINUTE = 60_000;
const playing: World = { playing: true, reducedMotion: false, edge: { length: 160, noSit: [] } };
const paused: World = { ...playing, playing: false };
// In the air the sprite box places it, so its point is part of what's shown (C4a).
const key = (p: Pose) => `${p.animation}/${p.frame}/${p.x}/${p.facing}${p.air ? `@${p.air.x},${p.air.y}` : ""}`;

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
          expect(p.surface, "without an outline it never leaves the top").toBe("top");
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

describe("companion brain around the card (C3a)", () => {
  // The lab's mock card at 100%: 248 × 88 CSS px at 2 px per art pixel.
  const around: World = { ...playing, edge: { length: 124, noSit: [[20, 40]] }, around: { side: 44, bottom: 124 } };
  const lengths = { top: 124, bottom: 124, left: 44, right: 44 };
  /** Where a surface change must happen: the end it leaves and the end it arrives at. */
  const CORNERS: Record<string, [number, number]> = {
    "top>left": [0, 0],
    "top>right": [123, 0],
    "left>bottom": [43, 0],
    "right>bottom": [43, 123],
    "bottom>left": [0, 43],
    "bottom>right": [123, 43],
    "left>top": [0, 0],
    "right>top": [0, 123],
  };

  /** Runs until `when` holds for the pose (or `to`), the way `run` does; null if it never did. */
  function runUntil(skin: Skin, world: World, brain: Brain, to: number, when: (p: Pose) => boolean) {
    let b = brain;
    for (;;) {
      const at = nextChangeAt(b, skin, world);
      if (at === null || at > to) return null;
      b = advance(b, skin, world, at);
      if (when(pose(b))) return { brain: b, t: at };
    }
  }

  for (const skin of skins) {
    it(`${skin.id}: an hour travels the whole outline, within the budget, turning only at corners`, () => {
      const surfaces = new Set<string>();
      for (const seed of [1, 2, 3]) {
        const start = createBrain(skin, around, 0, seed);
        const { changes } = run(skin, around, start, 0, 60 * MINUTE);
        const times = changes.map((c) => c.t);
        expect(busiestMinute(times), `seed ${seed}: busiest minute`).toBeLessThanOrEqual(BUDGET_PER_MINUTE);
        let prev = pose(start);
        for (const { pose: p } of changes) {
          surfaces.add(p.surface);
          expect(p.x, `seed ${seed}: ${p.surface} position`).toBeGreaterThanOrEqual(0);
          expect(p.x, `seed ${seed}: ${p.surface} position`).toBeLessThan(lengths[p.surface]);
          if (p.surface === "left" || p.surface === "right") expect(p.animation).toBe("climb");
          else if (p.surface === "bottom") expect(p.animation).toBe("hang");
          else expect(["idle", "walk", "sit", "wake", "react"]).toContain(p.animation);
          if (p.surface !== prev.surface) {
            const corner = CORNERS[`${prev.surface}>${p.surface}`];
            expect(corner, `seed ${seed}: ${prev.surface} → ${p.surface} isn't a corner`).toBeDefined();
            expect([prev.x, p.x], `seed ${seed}: ${prev.surface} → ${p.surface}`).toEqual(corner);
          } else if (p.animation === "climb" && prev.animation === "climb") {
            // At most the step for entering this frame (its stride, or none while it clings): never a catch-up jump.
            const most = stepPx("climb", skin.animations.climb, p.frame);
            expect(Math.abs(p.x - prev.x), `seed ${seed}: climbs a frame's step at a time`).toBeLessThanOrEqual(most);
          }
          prev = p;
        }
      }
      expect([...surfaces].sort(), "every surface, across three seeds").toEqual(["bottom", "left", "right", "top"]);
    });
  }

  it("with the music off on a side or under the bottom, it holds still, then carries on when it's back", () => {
    for (const skin of skins) {
      for (const where of ["left", "bottom"] as const) {
        const reached = runUntil(skin, around, createBrain(skin, around, 0, 1), 3 * 60 * MINUTE, (p) =>
          where === "left" ? p.surface === "left" || p.surface === "right" : p.surface === "bottom",
        )!;
        expect(reached, `${skin.id}: reached ${where}`).not.toBeNull();
        const quiet: World = { ...around, playing: false };
        const stopped = setWorld(reached.brain, skin, around, quiet, reached.t + 10);
        expect(pose(stopped), `${skin.id}: in its rest frame`).toMatchObject({ surface: pose(reached.brain).surface, frame: 0 });
        expect(nextChangeAt(stopped, skin, quiet), `${skin.id} ${where}: still, no sleeping off the top`).toBeNull();
        const resumed = setWorld(stopped, skin, quiet, around, reached.t + 20 * MINUTE);
        expect(nextChangeAt(resumed, skin, around), `${skin.id} ${where}: carries on`).not.toBeNull();
      }
    }
  });

  it("off the top it doesn't react to a new track; reduced motion or losing the outline puts it back on the top", () => {
    const skin = SKINS.cassette;
    const reached = runUntil(skin, around, createBrain(skin, around, 0, 2), 3 * 60 * MINUTE, (p) => p.surface === "right")!;
    expect(reached).not.toBeNull();
    expect(trackChanged(reached.brain, skin, around, reached.t + 1)).toBe(reached.brain);

    const reduced: World = { ...around, reducedMotion: true };
    const still = setWorld(reached.brain, skin, around, reduced, reached.t + 1);
    expect(pose(still)).toMatchObject({ surface: "top", x: 123, frame: 0 }); // the right side's top corner
    expect(["sit", "idle"]).toContain(pose(still).animation);
    expect(nextChangeAt(still, skin, reduced)).toBeNull();

    const topOnly: World = { ...around, around: undefined };
    const back = setWorld(reached.brain, skin, around, topOnly, reached.t + 1);
    expect(pose(back)).toMatchObject({ surface: "top", animation: "idle" });
  });

  it("a shrinking side keeps it on the card, and at the new end it rounds the corner", () => {
    const skin = SKINS.pilcrow;
    const reached = runUntil(skin, around, createBrain(skin, around, 0, 3), 3 * 60 * MINUTE, (p) => p.surface === "left" && p.x > 20)!;
    expect(reached).not.toBeNull();
    const short: World = { ...around, around: { side: 10, bottom: 124 } };
    const b = setWorld(reached.brain, skin, around, short, reached.t + 1);
    expect(pose(b)).toMatchObject({ surface: "left", x: 9 });
    const next = runUntil(skin, short, b, reached.t + 10 * MINUTE, (p) => p.surface !== "left")!;
    expect(pose(next.brain).surface).toMatch(/^(bottom|top)$/);
  });
});

describe("companion brain in the pointer's hand (C4a)", () => {
  const around: World = { ...playing, edge: { length: 124, noSit: [] }, around: { side: 44, bottom: 124 } };
  /** Landed on the top at 30, its sprite box 15 art px above the top's line (where place.ts would put it). */
  const onTop: Landing = { surface: "top", x: 30, facing: 1, at: { x: 20, y: -15 } };
  /** Awake on the top, idling. */
  const idling = (skin: Skin, world: World) => {
    const b = createBrain(skin, world, 0, 6);
    expect(pose(b).animation).toBe("idle");
    return b;
  };

  it("a click makes it react on the top, once at a time; asleep, it stirs and dozes off again", () => {
    for (const skin of skins) {
      const b = idling(skin, playing);
      const reacting = poke(b, skin, playing, 100);
      expect(pose(reacting), skin.id).toMatchObject({ animation: "react", frame: 0 });
      expect(reacting.changes.length, "a click is a change that always happens").toBe(b.changes.length + 1);
      expect(poke(reacting, skin, playing, 200), "not again mid-reaction").toBe(reacting);
      const after = run(skin, playing, reacting, 100, MINUTE).changes;
      expect(after.find((c) => c.pose.animation !== "react")!.pose.animation, skin.id).toBe("idle");

      const asleep = run(skin, paused, createBrain(skin, paused, 0, 6), 0, 5 * MINUTE).brain;
      expect(nextChangeAt(asleep, skin, paused), "asleep and still").toBeNull();
      const stirred = poke(asleep, skin, paused, 5 * MINUTE);
      expect(pose(stirred).animation, skin.id).toBe("wake");
      const { changes, brain } = run(skin, paused, stirred, 5 * MINUTE, 10 * MINUTE);
      const wakeFrames = skin.animations.wake.frames.length;
      // The whole wake plays (the drowsy timer starts over), then it's back asleep: a few loops, then still.
      expect(changes.slice(0, wakeFrames - 1).every((c) => c.pose.animation === "wake"), skin.id).toBe(true);
      expect(changes[wakeFrames - 1].pose.animation, skin.id).toBe("sleep");
      // The rest of the wake, falling asleep, then the sleep's loops.
      expect(changes.length, skin.id).toBe(wakeFrames - 1 + 1 + SLEEP_LOOPS * skin.animations.sleep.frames.length);
      expect(nextChangeAt(brain, skin, paused)).toBeNull();
    }
  });

  it("a click does nothing under reduced motion, off the top or in the air", () => {
    const skin = SKINS.pilcrow;
    const reduced: World = { ...playing, reducedMotion: true };
    const still = createBrain(skin, reduced, 0, 6);
    expect(poke(still, skin, reduced, 10)).toBe(still);
    const onSide = { ...idling(skin, around), surface: "left" as const, mode: "climb" as const, holding: true };
    expect(poke(onSide, skin, around, 10)).toBe(onSide);
    const held = pickUp(idling(skin, playing), skin, playing, 10, { x: 4, y: -20 });
    expect(poke(held, skin, playing, 20)).toBe(held);
  });

  it("picked up it dangles where it's carried; carrying isn't counted against the budget", () => {
    for (const skin of skins) {
      const b = idling(skin, playing);
      const held = pickUp(b, skin, playing, 100, { x: 10, y: -20 });
      expect(pose(held), skin.id).toMatchObject({ animation: "held", frame: 0, air: { x: 10, y: -20 } });
      expect(held.changes.length).toBe(b.changes.length + 1);
      const carried = carry(held, { x: 40, y: -18 });
      expect(pose(carried).air).toEqual({ x: 40, y: -18 });
      expect(carried.changes, "the pointer's moves aren't its own changes").toBe(held.changes);
      expect(carry(carried, { x: 40, y: -18 }), "the same point is no change at all").toBe(carried);
      expect(carry(b, { x: 1, y: 1 }), "only a held creature is carried").toBe(b);
      // Held for an hour, its dangling stays within the budget.
      const { changes } = run(skin, playing, carried, 100, 60 * MINUTE + 100);
      expect(changes.every((c) => c.pose.animation === "held"), skin.id).toBe(true);
      expect(busiestMinute(changes.map((c) => c.t)), skin.id).toBeLessThanOrEqual(BUDGET_PER_MINUTE);
    }
  });

  it("dropped over the top it falls, faster and faster, then lands and carries on", () => {
    for (const skin of skins) {
      for (const world of [playing, paused]) {
        const held = pickUp(idling(skin, playing), skin, world, 100, { x: 20, y: -45 });
        const falling = drop(held, skin, world, 200, onTop);
        expect(pose(falling), skin.id).toMatchObject({ animation: "fall", air: { x: 20, y: -45 } });
        const { changes } = run(skin, world, falling, 200, 200 + MINUTE);
        const fall = changes.filter((c) => c.pose.animation === "fall");
        expect(fall.length, `${skin.id}: 30 art px is a few steps`).toBeGreaterThanOrEqual(3);
        let prev = pose(falling).air!;
        let prevStep = 0;
        for (const [i, c] of fall.entries()) {
          expect(c.t, "one step a tick").toBe(200 + (i + 1) * FALL_TICK_MS);
          const step = c.pose.air!.y - prev.y;
          expect(c.pose.air!.x, "straight down").toBe(20);
          expect(step, "speeding up").toBeGreaterThan(prevStep);
          expect(step).toBeLessThanOrEqual(MAX_STEP);
          [prev, prevStep] = [c.pose.air!, step];
        }
        const landed = changes[fall.length];
        expect(landed.t).toBe(200 + (fall.length + 1) * FALL_TICK_MS);
        expect(landed.pose, skin.id).toMatchObject({ animation: "land", frame: 0, surface: "top", x: 30, facing: 1, air: null });
        // Land plays once; then it's idle with the music on, asleep with it off.
        const rest = changes.find((c) => c.pose.animation !== "land" && c.t > landed.t)!;
        expect(rest.pose.animation, skin.id).toBe(world.playing ? "idle" : "sleep");
      }
    }
  });

  it("dropped beside a side or under the bottom it grabs on at once, and carries on from there", () => {
    for (const skin of skins) {
      const held = pickUp(idling(skin, around), skin, around, 100, { x: -20, y: 10 });
      const side = drop(held, skin, around, 200, { surface: "left", x: 20, facing: -1, at: { x: -16, y: 8 } });
      expect(pose(side), skin.id).toMatchObject({ animation: "climb", surface: "left", x: 20, facing: -1, frame: 0, air: null });
      expect(side.holding).toBe(true);
      const up = run(skin, around, side, 200, 10 * MINUTE).changes;
      expect(up.find((c) => c.pose.surface !== "left")!.pose, `${skin.id}: climbs back up to the top`).toMatchObject({ surface: "top", x: 0 });

      const under = drop(held, skin, around, 200, { surface: "bottom", x: 90, facing: 1, at: { x: 80, y: 44 } });
      expect(pose(under), skin.id).toMatchObject({ animation: "hang", surface: "bottom", x: 90, air: null });
      expect(nextChangeAt(under, skin, around)).toBeGreaterThan(200);
      // With the music off it holds still there, as it would have got there on its own (C3a).
      const quiet: World = { ...around, playing: false };
      expect(nextChangeAt(drop(pickUp(idling(skin, around), skin, quiet, 100, { x: 80, y: 50 }), skin, quiet, 200, { surface: "bottom", x: 90, facing: 1, at: { x: 80, y: 44 } }), skin, quiet)).toBeNull();
    }
  });

  it("under reduced motion it can still be carried, holding still, and a drop rests it on the top with no fall", () => {
    for (const skin of skins) {
      const reduced: World = { ...around, reducedMotion: true };
      const held = pickUp(createBrain(skin, reduced, 0, 6), skin, reduced, 100, { x: 20, y: -45 });
      expect(nextChangeAt(held, skin, reduced), "no dangling frames").toBeNull();
      const top = drop(held, skin, reduced, 200, onTop);
      expect(pose(top), skin.id).toMatchObject({ surface: "top", x: 30, frame: 0, air: null });
      expect(["sit", "idle"]).toContain(pose(top).animation);
      expect(nextChangeAt(top, skin, reduced)).toBeNull();
      // A side that somehow got through still ends on the top: at its corner.
      const fromSide = drop(held, skin, reduced, 200, { surface: "right", x: 10, facing: -1, at: { x: 124, y: 0 } });
      expect(pose(fromSide)).toMatchObject({ surface: "top", x: 123, air: null });
    }
  });

  it("in the hand, the music and new tracks don't move it; falling, it always finishes", () => {
    const skin = SKINS.cassette;
    const held = pickUp(idling(skin, playing), skin, playing, 100, { x: 20, y: -45 });
    const stopped = setWorld(held, skin, playing, paused, 200);
    expect(pose(stopped)).toMatchObject({ animation: "held", air: { x: 20, y: -45 } });
    expect(trackChanged(stopped, skin, paused, 300)).toBe(stopped);
    const still = run(skin, paused, stopped, 200, 10 * MINUTE).changes;
    expect(still.every((c) => c.pose.animation === "held"), "dangles, doesn't doze off in the hand").toBe(true);
    // Reduced motion turning on mid-fall lands it at once, on the top, in a still pose.
    const falling = drop(held, skin, playing, 400, onTop);
    const reduced: World = { ...playing, reducedMotion: true };
    const landed = setWorld(falling, skin, playing, reduced, 420);
    expect(pose(landed)).toMatchObject({ surface: "top", x: 30, air: null });
    expect(nextChangeAt(landed, skin, reduced)).toBeNull();
    // Losing the outline while it's carried keeps it in the hand.
    const heldAround = pickUp(idling(skin, around), skin, around, 100, { x: -20, y: 10 });
    expect(pose(setWorld(heldAround, skin, around, playing, 200))).toMatchObject({ animation: "held", air: { x: -20, y: 10 } });
  });
});
