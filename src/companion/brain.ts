// The companion's brain (PLAN.md §4b, M2 C2): a pure, seeded state machine. It decides what the creature does on the
// player's top edge, frame by frame, and when the next visible change is due. Given the card's outline (`World.around`,
// C3a) it also turns the top's corners, climbs the sides in short legs and hangs under the bottom; without one it lives
// on the top edge exactly as before. The component only renders `pose()` and sets one timer for `nextChangeAt()`.
// Plain data in, plain data out, so an hour can be simulated in a unit test.
//
// The change budget (C0 spike, docs/DECISIONS.md 2026-10-17): every visible change re-composites the whole
// transparent window (~3–6 ms of CPU), so the creature is still most of the time. Optional changes (blinks, sleepy
// "z"s, walks, climbs) only start when the last minute's changes leave room for all of them; changes caused by the
// music (falling asleep, waking, a track-change reaction) always happen.
import type { Surface } from "./place";
import { REQUIRED_ANIMATIONS, frameMs, stepPx, type AnimationName, type Skin } from "./skin";

export type Mode = Extract<AnimationName, "idle" | "walk" | "sit" | "sleep" | "wake" | "react" | "climb" | "hang">;
export type { Surface };

export interface Edge {
  /** Anchor positions the creature can stand at, in art px along the edge: 0 … length − 1. */
  length: number;
  /** Inclusive [from, to] ranges (art px) where it must not sit: its legs would hang over a part (C2b measures them). */
  noSit: readonly (readonly [number, number])[];
}

export interface World {
  playing: boolean;
  reducedMotion: boolean;
  /** The top edge. */
  edge: Edge;
  /**
   * The rest of the card's outline (C3a), in positions (art px): each side's length from the top down, and the
   * bottom's from the card's left. Absent: it lives on the top only.
   */
  around?: { side: number; bottom: number };
}

export interface Brain {
  mode: Mode;
  frame: number;
  surface: Surface;
  /** The anchor's position along its surface, art px. */
  x: number;
  /** On the top and bottom, which way it faces; on a side, which way it climbs (1 = down). */
  facing: 1 | -1;
  /** Climb: clinging still between legs, until `until`. */
  holding: boolean;
  /** When the current frame went up. */
  frameAt: number;
  /** Idle, sit, hang and a climb's hold: when the mode ends. */
  until: number;
  /** Walk and climb: where it's heading. */
  target: number;
  /** Loops completed in the current mode. */
  loops: number;
  /** Frames are held: nothing changes until the music or the edge does. */
  still: boolean;
  /** When the music stopped (it falls asleep DROWSY_MS later); null while playing. */
  quietSince: number | null;
  /** mulberry32 state (the generator in src/fx/beat.ts, unrolled so the brain stays plain data). */
  rng: number;
  /** When the visible changes of the last minute happened, oldest first. */
  changes: readonly number[];
}

export interface Pose {
  animation: Mode;
  frame: number;
  surface: Surface;
  x: number;
  facing: 1 | -1;
}

/** Visible changes allowed in any rolling minute: 1.5 a second (~1% of a core at C0's cost per change). */
export const BUDGET_PER_MINUTE = 90;
const MINUTE = 60_000;
/** Sleep plays its loop this many times, then holds still for as long as the music is off. */
export const SLEEP_LOOPS = 3;
/** The music has been off this long before it falls asleep, so a quick pause doesn't send it to bed. */
export const DROWSY_MS = 3000;
type Range = readonly [number, number];
const IDLE_MS: Range = [6000, 20_000];
const SIT_MS: Range = [10_000, 40_000];
/** Walk distance, art px. */
const WALK_PX: Range = [6, 40];
/** Fewer walk (or climb) frames than this aren't worth starting. */
const MIN_WALK_FRAMES = 4;
/** Climb leg distance, art px: a tall card's side takes several legs, so no single one blows the budget. */
const CLIMB_PX: Range = [10, 40];
/** Clinging still between climb legs. */
const HOLD_MS: Range = [2000, 8000];
/** Hanging under the bottom. */
const HANG_MS: Range = [8000, 25_000];
/** Arriving at an end of the top, the chance it turns the corner and climbs down (when there's an outline). */
export const CORNER_CHANCE = 0.5;
/** A climb leg the budget can't cover yet is tried again this much later. */
const RETRY_MS = 2000;
/** The top's modes: what it does there, and what the music can change (sleep, wake, a reaction). */
const AWAKE: readonly Mode[] = ["idle", "walk", "sit", "wake", "react"];

/** One mulberry32 step: [a number in [0, 1), the next state]. */
function random(state: number): [number, number] {
  const a = (state + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

const poseKey = (b: Pick<Brain, "mode" | "frame" | "surface" | "x" | "facing">) => `${b.mode}/${b.frame}/${b.surface}/${b.x}/${b.facing}`;

/** A surface's length in positions (art px). */
function lengthOf(world: World, surface: Surface): number {
  if (surface === "top" || !world.around) return world.edge.length;
  return Math.max(1, surface === "bottom" ? world.around.bottom : world.around.side);
}

/** A working copy with helpers; every exported function returns a fresh Brain and leaves its input alone. */
class Draft {
  b: Brain;
  constructor(
    b: Brain,
    readonly skin: Skin,
    readonly world: World,
  ) {
    this.b = { ...b };
  }
  rand(): number {
    const [v, next] = random(this.b.rng);
    this.b.rng = next;
    return v;
  }
  between([lo, hi]: Range): number {
    return lo + Math.floor(this.rand() * (hi - lo + 1));
  }
  pick<T>(options: readonly (readonly [T, number])[]): T {
    let r = this.rand() * options.reduce((s, [, w]) => s + w, 0);
    for (const [v, w] of options) if ((r -= w) < 0) return v;
    return options[options.length - 1][0];
  }
  /** Changes in the minute before `now`. */
  recent(now: number): number[] {
    return this.b.changes.filter((t) => t > now - MINUTE);
  }
  /** The earliest time `n` more changes fit in the budget (`now` if they fit already). */
  affordableAt(now: number, n: number): number {
    const recent = this.recent(now);
    const over = recent.length + n - BUDGET_PER_MINUTE;
    return over <= 0 ? now : recent[over - 1] + MINUTE;
  }
  /** Sets the pose; records a change when anything visible differs. */
  show(now: number, next: Partial<Pick<Brain, "mode" | "frame" | "surface" | "x" | "facing">>) {
    const before = poseKey(this.b);
    Object.assign(this.b, next);
    this.b.frameAt = now;
    if (poseKey(this.b) !== before) this.b.changes = [...this.recent(now), now];
  }
  canSitAt(x: number): boolean {
    return !this.world.edge.noSit.some(([from, to]) => x >= from && x <= to);
  }
  clampX(x: number, surface: Surface = this.b.surface): number {
    return Math.max(0, Math.min(lengthOf(this.world, surface) - 1, x));
  }
  /** Back onto the top from wherever it is on the outline: a side's top corner, or straight up from the bottom. */
  toTop(now: number) {
    const { surface } = this.b;
    if (surface === "top") return;
    this.b.holding = false;
    const end = lengthOf(this.world, "top") - 1;
    if (surface === "left") this.show(now, { surface: "top", x: 0, facing: 1 });
    else if (surface === "right") this.show(now, { surface: "top", x: end, facing: -1 });
    else this.show(now, { surface: "top", x: this.clampX(this.b.x, "top") });
  }
  /** Settles into the resting pose for the current music on the top, starting a fresh mode. */
  rest(now: number) {
    const { playing, reducedMotion } = this.world;
    this.toTop(now);
    this.b.loops = 0;
    this.b.still = reducedMotion;
    if (!playing) {
      this.b.quietSince ??= now;
      this.show(now, { mode: "sleep", frame: 0 });
    } else if (reducedMotion) {
      // A still pose: sitting where it can, standing where its legs would hang over a part. (`until` is never due
      // under reduced motion; it's set anyway so no state ever carries a stale one.)
      this.b.until = now + this.between(IDLE_MS);
      this.show(now, { mode: this.canSitAt(this.b.x) ? "sit" : "idle", frame: 0 });
    } else {
      this.b.until = now + this.between(IDLE_MS);
      this.show(now, { mode: "idle", frame: 0 });
    }
  }
  /** Idle is over: walk, sit or idle on. */
  choose(now: number) {
    const walk = this.planWalk(now);
    const options: [Mode, number][] = [["idle", 1]];
    if (walk) options.push(["walk", 3]);
    if (this.canSitAt(this.b.x)) options.push(["sit", 2]);
    const mode = this.pick(options);
    this.b.loops = 0;
    if (mode === "walk" && walk) {
      this.b.target = walk.target;
      this.show(now, { mode: "walk", frame: 0, facing: walk.facing });
    } else if (mode === "sit") {
      this.b.until = now + this.between(SIT_MS);
      this.show(now, { mode: "sit", frame: 0 });
    } else {
      this.b.until = now + this.between(IDLE_MS);
      this.show(now, { mode: "idle", frame: 0 });
    }
  }
  /**
   * How many frames of `name` it takes to move up to `distance` art px within the budget, keeping `reserve` changes
   * for the stop. Each frame is one change.
   */
  framesFor(name: "walk" | "climb", distance: number, now: number, reserve: number): { frames: number; moved: number } {
    const anim = this.skin.animations[name];
    const most = BUDGET_PER_MINUTE - this.recent(now).length - reserve;
    let frames = 0;
    let moved = 0;
    while (moved < distance && frames < most) {
      frames++;
      moved += stepPx(name, anim, frames % anim.frames.length);
    }
    return { frames, moved };
  }
  /** A walk that fits the edge and the budget, or null. */
  planWalk(now: number): { target: number; facing: 1 | -1 } | null {
    const room = (f: 1 | -1) => (f > 0 ? this.world.edge.length - 1 - this.b.x : this.b.x);
    let facing: 1 | -1 = this.rand() < 0.5 ? -1 : 1;
    const wanted = this.between(WALK_PX);
    // On an outline, a walk may run out at the top's end, where the corner is (C3a); on the top alone it turns back.
    if (room(facing) < wanted && !(this.world.around && room(facing) > 0)) facing = facing > 0 ? -1 : 1;
    const distance = Math.min(wanted, room(facing));
    // Each walk frame is one change; the start and the stop are two more.
    const { frames, moved } = this.framesFor("walk", distance, now, 2);
    if (frames < MIN_WALK_FRAMES || moved === 0) return null;
    return { target: this.b.x + facing * Math.min(moved, distance), facing };
  }
  /** Down a side from the top's end it's facing (C3a): it clings at the side's top before its first leg. */
  turnDown(now: number) {
    this.b.loops = 0;
    this.b.holding = true;
    this.b.until = now + this.between(HOLD_MS);
    this.show(now, { surface: this.b.facing < 0 ? "left" : "right", x: 0, facing: 1, mode: "climb", frame: 0 });
  }
  /** Clinging is over: climb the next leg if the budget covers it, else try again a little later. */
  climbLeg(now: number) {
    const room = this.b.facing > 0 ? lengthOf(this.world, this.b.surface) - 1 - this.b.x : this.b.x;
    if (room === 0) return this.climbArrived(now); // the side shrank under it: it's at the corner already
    const distance = Math.min(this.between(CLIMB_PX), room);
    // Each frame is a change, and stopping to cling (frame 0 again) is one more.
    const { frames, moved } = this.framesFor("climb", distance, now, 1);
    if (moved === 0 || (frames < MIN_WALK_FRAMES && moved < distance)) {
      this.b.until = now + RETRY_MS;
      return;
    }
    this.b.holding = false;
    this.b.target = this.b.x + this.b.facing * Math.min(moved, distance);
    // Not a visible change (it's still in its rest frame), but its first step is a frame from now, not from when the
    // hold began: else every frame since then would come due at once, a jump.
    this.b.frameAt = now;
  }
  /** A climb leg arrived: on round the next corner at a side's end, else cling a while. */
  climbArrived(now: number) {
    const { surface, x, facing } = this.b;
    const left = surface === "left";
    this.b.loops = 0;
    if (facing > 0 && x === lengthOf(this.world, surface) - 1) {
      this.b.holding = false;
      this.b.until = now + this.between(HANG_MS);
      const bottomEnd = lengthOf(this.world, "bottom") - 1;
      this.show(now, { surface: "bottom", x: left ? 0 : bottomEnd, facing: left ? 1 : -1, mode: "hang", frame: 0 });
    } else if (facing < 0 && x === 0) {
      this.b.holding = false;
      this.b.until = now + this.between(IDLE_MS);
      const topEnd = lengthOf(this.world, "top") - 1;
      this.show(now, { surface: "top", x: left ? 0 : topEnd, facing: left ? 1 : -1, mode: "idle", frame: 0 });
    } else {
      this.b.holding = true;
      this.b.until = now + this.between(HOLD_MS);
      this.show(now, { frame: 0 });
    }
  }
  /** Done hanging: back up the side it came down. */
  leaveBottom(now: number) {
    const side: Surface = this.b.x < lengthOf(this.world, "bottom") / 2 ? "left" : "right";
    this.b.loops = 0;
    this.b.holding = true;
    this.b.until = now + this.between(HOLD_MS);
    this.show(now, { surface: side, x: lengthOf(this.world, side) - 1, facing: -1, mode: "climb", frame: 0 });
  }
  /** Advances the current mode by one frame, or ends it. */
  nextFrame(now: number) {
    const { mode, frame } = this.b;
    const anim = this.skin.animations[mode];
    const last = frame === anim.frames.length - 1;
    // Wake and react play once. A climb always cycles: its frames are what move it.
    if (last && !anim.loop && mode !== "climb") return this.rest(now);
    const next = last ? 0 : frame + 1;
    if (next === 0) this.b.loops++;
    if (mode === "walk" || mode === "climb") {
      const from = this.b.x;
      const want = this.b.facing * stepPx(mode, anim, next);
      const x = this.clampX(from + want);
      const arrived = this.b.facing > 0 ? x >= this.b.target : x <= this.b.target;
      this.show(now, { frame: next, x });
      if (arrived || (want !== 0 && x === from)) this.b.target = x; // there, or stopped by the end of the edge
      return;
    }
    this.show(now, { frame: next });
    if (mode === "sleep" && next === 0 && this.b.loops >= SLEEP_LOOPS) this.b.still = true;
  }
}

type DueKind = "drowsy" | "arrive" | "until" | "frame";

/** The next due change and its kind; on a tie the earlier kind in this order wins. */
function nextDue(b: Brain, skin: Skin, world: World): { at: number; kind: DueKind } | null {
  // Off the top with the music off, it holds where it is: there's no sleeping on a side (C3a).
  if (b.surface !== "top" && !world.playing) return null;
  const d = new Draft(b, skin, world);
  const candidates: [number, DueKind][] = [];
  if (AWAKE.includes(b.mode) && !world.playing && b.quietSince !== null) candidates.push([b.quietSince + DROWSY_MS, "drowsy"]);
  if (!world.reducedMotion && !b.still) {
    const anim = skin.animations[b.mode];
    const frameEnd = b.frameAt + frameMs(anim, b.frame);
    const moving = b.mode === "walk" || (b.mode === "climb" && !b.holding);
    if (moving && b.x === b.target) candidates.push([frameEnd, "arrive"]);
    // Ending an idle, a sit or a hang is a change too, so it waits for room in the budget like a blink does.
    if ((b.mode === "idle" || b.mode === "sit" || b.mode === "hang") && world.playing)
      candidates.push([Math.max(b.until, d.affordableAt(b.frameAt, 1)), "until"]);
    // A clinging climber plans its next leg, budget and all, when the hold is over.
    // A hang that doesn't loop holds its last frame until it lets go.
    const hangHeld = b.mode === "hang" && !anim.loop && b.frame === anim.frames.length - 1;
    if (b.mode === "climb" && b.holding) candidates.push([b.until, "until"]);
    else if (!hangHeld && (moving || anim.frames.length > 1 || !anim.loop)) {
      // Starting another loop of a resting animation is optional: only when the budget covers the whole loop.
      const optional = anim.loop && !moving && b.frame === 0;
      candidates.push([optional ? Math.max(frameEnd, d.affordableAt(b.frameAt, anim.frames.length)) : frameEnd, "frame"]);
    }
  }
  let best: { at: number; kind: DueKind } | null = null;
  for (const [at, kind] of candidates) if (!best || at < best.at) best = { at, kind };
  return best;
}

export function pose(b: Brain): Pose {
  return { animation: b.mode, frame: b.frame, surface: b.surface, x: b.x, facing: b.facing };
}

/** A new brain somewhere on the top edge: awake if the music is playing, asleep if not. */
export function createBrain(skin: Skin, world: World, now: number, seed: number): Brain {
  for (const name of REQUIRED_ANIMATIONS) if (!skin.animations[name]) throw new Error(`skin ${skin.id} lacks ${name}`);
  const d = new Draft(
    {
      mode: "idle",
      frame: 0,
      surface: "top",
      x: 0,
      facing: 1,
      holding: false,
      frameAt: now,
      until: now,
      target: 0,
      loops: 0,
      still: false,
      quietSince: null,
      rng: seed >>> 0,
      changes: [],
    },
    skin,
    world,
  );
  d.b.x = d.between([0, Math.max(0, world.edge.length - 1)]);
  d.b.facing = d.rand() < 0.5 ? -1 : 1;
  d.rest(now);
  d.b.changes = [];
  return d.b;
}

/** When the next visible change is due, or null when the creature holds still until something happens. */
export function nextChangeAt(b: Brain, skin: Skin, world: World): number | null {
  return nextDue(b, skin, world)?.at ?? null;
}

/** Applies every change due at or before `now`. */
export function advance(b: Brain, skin: Skin, world: World, now: number): Brain {
  let current = b;
  for (let guard = 0; guard < 100_000; guard++) {
    const due = nextDue(current, skin, world);
    if (!due || due.at > now) return current;
    current = step(current, skin, world, due.at, due.kind);
  }
  throw new Error("companion brain: runaway loop");
}

function step(b: Brain, skin: Skin, world: World, t: number, kind: DueKind): Brain {
  const d = new Draft(b, skin, world);
  if (kind === "drowsy") d.rest(t); // the music is off: it falls asleep
  else if (kind === "arrive") {
    if (b.mode === "climb") d.climbArrived(t);
    // At the top's end, on an outline, it may turn the corner (the walk planner let it run out there).
    else if (world.around && (b.facing < 0 ? b.x === 0 : b.x === world.edge.length - 1) && d.rand() < CORNER_CHANCE) d.turnDown(t);
    else {
      d.b.loops = 0;
      d.b.until = t + d.between(IDLE_MS);
      d.show(t, { mode: "idle", frame: 0 });
    }
  } else if (kind === "until") {
    if (b.mode === "sit") d.rest(t);
    else if (b.mode === "hang") d.leaveBottom(t);
    else if (b.mode === "climb") d.climbLeg(t);
    else d.choose(t);
  } else d.nextFrame(t);
  return d.b;
}

/** The music, the motion setting or the outline changed. */
export function setWorld(b: Brain, skin: Skin, prev: World, world: World, now: number): Brain {
  const d = new Draft(b, skin, world);
  d.b.target = d.clampX(b.target);
  if (d.clampX(b.x) !== b.x) d.show(now, { x: d.clampX(b.x) });
  // Reduced motion puts it back on the top in a still pose; so does losing the outline it was on.
  if (world.reducedMotion !== prev.reducedMotion || (b.surface !== "top" && !world.around)) {
    d.rest(now);
    return d.b;
  }
  if (world.playing && !prev.playing) {
    d.b.quietSince = null;
    d.b.until = Math.max(d.b.until, now); // an idle that ran out during a short pause ends now, not in the past
    if (b.surface !== "top") d.b.frameAt = now; // held still off the top: its frames start again from now
    if (b.mode === "sleep") {
      if (world.reducedMotion) d.rest(now);
      else {
        d.b.loops = 0;
        d.b.still = false;
        d.show(now, { mode: "wake", frame: 0 });
      }
    }
  } else if (!world.playing && prev.playing) {
    d.b.quietSince = now;
    // Off the top it holds still where it is: clinging in a climb's rest frame, or in the hang's (C3a).
    if (b.surface !== "top") {
      if (b.mode === "climb") d.b.holding = true;
      d.show(now, { frame: 0 });
    }
  }
  if (d.b.mode === "sit" && !d.canSitAt(d.b.x)) d.rest(now);
  return d.b;
}

/** A new track started: a little reaction, if it's awake on the top and motion is allowed. */
export function trackChanged(b: Brain, skin: Skin, world: World, now: number): Brain {
  if (world.reducedMotion || !world.playing || b.surface !== "top" || !AWAKE.includes(b.mode)) return b;
  const d = new Draft(b, skin, world);
  d.b.loops = 0;
  d.b.still = false;
  d.show(now, { mode: "react", frame: 0 });
  return d.b;
}
