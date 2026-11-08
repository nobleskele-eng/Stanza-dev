// Companion skin format, version 2 (docs/COMPANION.md; PLAN.md §4b). A skin is one creature: its
// grid, palettes and the frames of every required animation. Validation returns machine codes and
// paths, never prose (displayed strings come from COPY.md, CLAUDE.md), like src/theme/variant.ts.

export const SKIN_FORMAT = 2;

/** Every skin must have all of these (the C2 brain's states). */
export const REQUIRED_ANIMATIONS = ["idle", "walk", "sit", "climb", "hang", "sleep", "wake", "react", "held", "fall", "land"] as const;
/**
 * A skin may have these (C3c): the corner poses, played once at a corner between two surfaces. `over` is bent over a
 * corner it stands on (a top corner, or a shelf's door); `under` is bent under a bottom corner. Drawn for the card's
 * left side (mirrored on the right). Each needs its own anchor: the art pixel just outside the corner, diagonally
 * (`over`: above-left of the card's corner pixel; `under`: below-left), and no opaque pixel may fall on the card's side
 * of it. A skin without them switches surfaces at a corner in one change, as before.
 */
export const OPTIONAL_ANIMATIONS = ["over", "under"] as const;
export type RequiredAnimation = (typeof REQUIRED_ANIMATIONS)[number];
export type OptionalAnimation = (typeof OPTIONAL_ANIMATIONS)[number];
export type AnimationName = RequiredAnimation | OptionalAnimation;

/** Palette slots per skin ("1"–"8" in frames). */
export const MAX_SLOTS = 8;
/** Frames per animation. */
export const MAX_FRAMES = 8;
/**
 * Frames per second. Kept low on purpose: every visible change re-composites the whole transparent
 * window (~3–6 ms of CPU, C0 spike), so the budget is about two changes a second on average.
 */
export const MAX_FPS = 12;
/** Art pixels an animation may move the creature on entering one frame (`steps`). */
export const MAX_STEP = 8;
export const MIN_GRID = 8;
export const MAX_GRID = 32;

export interface SkinAnimation {
  fps: number;
  loop: boolean;
  frames: string[][];
  /** Optional ms per frame (same length as frames), overriding fps: e.g. a long open-eyes frame, then a short blink. */
  durations?: number[];
  /**
   * Optional art pixels the creature moves forward on entering each frame (format 2). Absent: 1 per frame for `walk`,
   * 0 for everything else. The bookworm inches: [4, 0] keeps its head planted while its tail catches up.
   */
  steps?: number[];
  /**
   * Optional contact point for this animation (format 2), overriding the skin's: e.g. `sit`, whose seat is higher
   * than its feet because its legs hang over the edge.
   */
  anchor?: Anchor;
  /**
   * Optional (D2b): where an accessory sits in each frame, per mount: one entry per frame, null where none is worn.
   * Needed by every animation for every mount the skin's accessories use.
   */
  rig?: Partial<Record<MountName, (Mount | null)[]>>;
}

/** Where on a creature an accessory sits (D2b): a hat or headphones on the head, a scarf at the neck. */
export const MOUNTS = ["head", "neck"] as const;
export type MountName = (typeof MOUNTS)[number];

/**
 * A mount in one frame: the art pixel the accessory's anchor sits on, and how the accessory is turned there (clockwise
 * quarter turns, then a vertical flip: a climb is a turn, an upside-down hang a flip).
 */
export interface Mount {
  x: number;
  y: number;
  turn?: 0 | 90 | 180 | 270;
  flip?: boolean;
}

/**
 * Something a creature can wear (D2b): drawn once, upright and facing right, in its own 1–3 colours (`a`–`c` in its
 * rows), and placed at a mount of every frame by `dress` (accessory.ts).
 */
export interface Accessory {
  mount: MountName;
  colours: string[];
  art: string[];
  /** The art pixel that sits on the mount. */
  anchor: Anchor;
}

/** The pixels an accessory's art may use: its colours, in order. */
export const ACCESSORY_SLOTS = ["a", "b", "c"] as const;

/** An art pixel whose bottom edge rests on the surface the creature stands or sits on. */
export interface Anchor {
  x: number;
  y: number;
}

export interface Skin {
  id: string;
  name: string;
  format: number;
  grid: number;
  /** The foot point in art pixels: where the creature touches the surface it stands on. */
  anchor: Anchor;
  /** Named palettes; each is the colours of slots 1..n. Must include "default". */
  palettes: Record<string, string[]>;
  animations: Record<RequiredAnimation, SkinAnimation> & Partial<Record<OptionalAnimation, SkinAnimation>>;
  /** Optional (D2b): what it can wear, by id. */
  accessories?: Record<string, Accessory>;
  /** Set only on a dressed skin (`dress`), never in a file: the accessory worn, and its colours. */
  worn?: { id: string; colours: string[] };
}

/** An animation the skin has; throws for an optional one it lacks (callers check `skin.animations[name]` first). */
export function animationOf(skin: Skin, name: AnimationName): SkinAnimation {
  const anim = skin.animations[name];
  if (!anim) throw new Error(`skin ${skin.id} has no ${name}`);
  return anim;
}

export type SkinIssueCode =
  | "not-an-object"
  | "unknown-key"
  | "missing"
  | "format-mismatch"
  | "id-invalid"
  | "name-invalid"
  | "grid-invalid"
  | "anchor-invalid"
  | "palette-invalid"
  | "palette-length-mismatch"
  | "default-palette-missing"
  | "fps-invalid"
  | "loop-invalid"
  | "durations-invalid"
  | "steps-invalid"
  | "frames-invalid"
  | "rows-invalid"
  | "row-length"
  | "pixel-invalid"
  | "slot-out-of-range"
  | "corner-invalid"
  | "accessory-invalid"
  | "rig-invalid"
  | "rig-missing";

export interface SkinIssue {
  code: SkinIssueCode;
  path: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const TOP_KEYS = ["id", "name", "format", "grid", "anchor", "palettes", "animations"];
const OPTIONAL_TOP_KEYS = ["accessories"];
const ANIMATION_KEYS = ["fps", "loop", "frames", "durations", "steps", "anchor", "rig"];
const ACCESSORY_KEYS = ["mount", "colours", "art", "anchor"];
const TURNS = [0, 90, 180, 270];
const isAnchor = (v: unknown, grid: number | null) =>
  isObject(v) && Object.keys(v).every((k) => k === "x" || k === "y") && grid !== null && isInt(v.x, 0, grid - 1) && isInt(v.y, 0, grid - 1);
export const MIN_FRAME_MS = 50;
export const MAX_FRAME_MS = 10_000;

/** Checks a parsed `companion.json`. A skin with any issue is rejected whole: it must render every state. */
export function validateSkin(raw: unknown): { skin: Skin | null; issues: SkinIssue[] } {
  const issues: SkinIssue[] = [];
  const add = (code: SkinIssueCode, path: string) => issues.push({ code, path });
  if (!isObject(raw)) return { skin: null, issues: [{ code: "not-an-object", path: "" }] };

  for (const key of Object.keys(raw)) if (!TOP_KEYS.includes(key) && !OPTIONAL_TOP_KEYS.includes(key)) add("unknown-key", key);
  for (const key of TOP_KEYS) if (!(key in raw)) add("missing", key);
  if ("format" in raw && raw.format !== SKIN_FORMAT) add("format-mismatch", "format");
  if ("id" in raw && !(typeof raw.id === "string" && ID.test(raw.id))) add("id-invalid", "id");
  if ("name" in raw && !(typeof raw.name === "string" && raw.name.trim() !== "")) add("name-invalid", "name");
  const grid = isInt(raw.grid, MIN_GRID, MAX_GRID) ? (raw.grid as number) : null;
  if ("grid" in raw && grid === null) add("grid-invalid", "grid");

  if ("anchor" in raw && !isAnchor(raw.anchor, grid)) add("anchor-invalid", "anchor");

  let slots = 0;
  if ("palettes" in raw) {
    if (!isObject(raw.palettes) || Object.keys(raw.palettes).length === 0) add("palette-invalid", "palettes");
    else {
      if (!("default" in raw.palettes)) add("default-palette-missing", "palettes");
      const lengths = new Set<number>();
      for (const [name, colours] of Object.entries(raw.palettes)) {
        const ok =
          ID.test(name) &&
          Array.isArray(colours) &&
          colours.length >= 1 &&
          colours.length <= MAX_SLOTS &&
          colours.every((c) => typeof c === "string" && HEX.test(c));
        if (!ok) add("palette-invalid", `palettes.${name}`);
        else lengths.add(colours.length);
      }
      if (lengths.size > 1) add("palette-length-mismatch", "palettes");
      slots = lengths.size === 1 ? [...lengths][0] : 0;
    }
  }

  if ("animations" in raw) {
    if (!isObject(raw.animations)) add("missing", "animations");
    else {
      const known = [...REQUIRED_ANIMATIONS, ...OPTIONAL_ANIMATIONS] as readonly string[];
      for (const name of Object.keys(raw.animations)) if (!known.includes(name)) add("unknown-key", `animations.${name}`);
      const optional = OPTIONAL_ANIMATIONS.filter((name) => name in (raw.animations as object));
      for (const name of [...REQUIRED_ANIMATIONS, ...optional]) {
        const path = `animations.${name}`;
        const anim = raw.animations[name];
        if (!isObject(anim)) {
          add("missing", path);
          continue;
        }
        for (const key of Object.keys(anim)) if (!ANIMATION_KEYS.includes(key)) add("unknown-key", `${path}.${key}`);
        if (!isInt(anim.fps, 1, MAX_FPS)) add("fps-invalid", `${path}.fps`);
        if (typeof anim.loop !== "boolean") add("loop-invalid", `${path}.loop`);
        const frames = anim.frames;
        if (!Array.isArray(frames) || frames.length < 1 || frames.length > MAX_FRAMES) {
          add("frames-invalid", `${path}.frames`);
          continue;
        }
        frames.forEach((frame, f) => checkFrame(frame, grid, slots, `${path}.frames.${f}`, add));
        if ("durations" in anim) {
          const d = anim.durations;
          const ok = Array.isArray(d) && d.length === frames.length && d.every((ms) => isInt(ms, MIN_FRAME_MS, MAX_FRAME_MS));
          if (!ok) add("durations-invalid", `${path}.durations`);
        }
        if ("steps" in anim) {
          const st = anim.steps;
          const ok = Array.isArray(st) && st.length === frames.length && st.every((n) => isInt(n, 0, MAX_STEP));
          if (!ok) add("steps-invalid", `${path}.steps`);
        }
        if ("anchor" in anim && !isAnchor(anim.anchor, grid)) add("anchor-invalid", `${path}.anchor`);
        if ("rig" in anim) checkRig(anim.rig, frames.length, grid, `${path}.rig`, add);
        // A corner pose places by its own anchor, and never on the card's side of it (C3c).
        if (name === "over" || name === "under") {
          if (!("anchor" in anim)) add("missing", `${path}.anchor`);
          else if (isAnchor(anim.anchor, grid) && !cornerClear(frames, anim.anchor as Anchor, name)) add("corner-invalid", path);
        }
      }
    }
  }

  // Accessories (D2b): each well-formed, and every animation rigged for the mount it uses.
  if ("accessories" in raw) {
    if (!isObject(raw.accessories)) add("accessory-invalid", "accessories");
    else
      for (const [id, acc] of Object.entries(raw.accessories)) {
        const path = `accessories.${id}`;
        if (!ID.test(id) || !isAccessory(acc)) {
          add("accessory-invalid", path);
          continue;
        }
        if (isObject(raw.animations))
          for (const [name, anim] of Object.entries(raw.animations))
            if (isObject(anim) && !(isObject(anim.rig) && Array.isArray(anim.rig[acc.mount]))) add("rig-missing", `animations.${name}.rig.${acc.mount}`);
      }
  }

  return { skin: issues.length ? null : (raw as unknown as Skin), issues };
}

function checkRig(rig: unknown, frames: number, grid: number | null, path: string, add: (c: SkinIssueCode, p: string) => void) {
  if (!isObject(rig)) return add("rig-invalid", path);
  for (const [mount, list] of Object.entries(rig)) {
    const ok =
      (MOUNTS as readonly string[]).includes(mount) &&
      Array.isArray(list) &&
      list.length === frames &&
      list.every(
        (m) =>
          m === null ||
          (isObject(m) &&
            Object.keys(m).every((k) => ["x", "y", "turn", "flip"].includes(k)) &&
            grid !== null &&
            isInt(m.x, 0, grid - 1) &&
            isInt(m.y, 0, grid - 1) &&
            (m.turn === undefined || TURNS.includes(m.turn as number)) &&
            (m.flip === undefined || typeof m.flip === "boolean")),
      );
    if (!ok) add("rig-invalid", `${path}.${mount}`);
  }
}

function isAccessory(acc: unknown): acc is Accessory {
  if (!isObject(acc) || !Object.keys(acc).every((k) => ACCESSORY_KEYS.includes(k))) return false;
  const { mount, colours, art, anchor } = acc;
  if (!(MOUNTS as readonly string[]).includes(mount as string)) return false;
  if (!Array.isArray(colours) || colours.length < 1 || colours.length > ACCESSORY_SLOTS.length) return false;
  if (!colours.every((c) => typeof c === "string" && HEX.test(c))) return false;
  if (!Array.isArray(art) || art.length < 1 || art.length > MAX_GRID) return false;
  const width = typeof art[0] === "string" ? art[0].length : 0;
  const allowed = new Set([".", ...ACCESSORY_SLOTS.slice(0, colours.length)]);
  if (width < 1 || !art.every((r) => typeof r === "string" && r.length === width && [...r].every((c) => allowed.has(c)))) return false;
  return isObject(anchor) && isInt(anchor.x, 0, width - 1) && isInt(anchor.y, 0, art.length - 1);
}

/** No opaque pixel of a corner pose on the card's side of its anchor: below-right (`over`) or above-right (`under`). */
function cornerClear(frames: unknown[], a: Anchor, name: "over" | "under"): boolean {
  return frames.every(
    (frame) =>
      !Array.isArray(frame) ||
      frame.every(
        (row, y) =>
          typeof row !== "string" ||
          [...row].every((c, x) => c === "." || x <= a.x || (name === "over" ? y <= a.y : y >= a.y)),
      ),
  );
}

function checkFrame(frame: unknown, grid: number | null, slots: number, path: string, add: (c: SkinIssueCode, p: string) => void) {
  if (!Array.isArray(frame) || (grid !== null && frame.length !== grid)) {
    add("rows-invalid", path);
    return;
  }
  frame.forEach((row, y) => {
    if (typeof row !== "string" || (grid !== null && row.length !== grid)) {
      add("row-length", `${path}.${y}`);
      return;
    }
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === ".") continue;
      if (!/^[1-8]$/.test(c)) {
        add("pixel-invalid", `${path}.${y}.${x}`);
        return;
      }
      if (slots > 0 && Number(c) > slots) {
        add("slot-out-of-range", `${path}.${y}.${x}`);
        return;
      }
    }
  });
}

/** How long frame `i` of an animation stays up, in ms. */
export const frameMs = (anim: SkinAnimation, i: number) => anim.durations?.[i] ?? Math.round(1000 / anim.fps);

/** Art pixels the creature moves forward on entering frame `i` (`steps`; absent: 1 for `walk` and `climb`, else 0). */
export const stepPx = (name: AnimationName, anim: SkinAnimation, i: number) =>
  anim.steps?.[i] ?? (name === "walk" || name === "climb" ? 1 : 0);

/** The opaque pixels' extremes across every frame of an animation, in art px. */
function opaqueBounds(frames: readonly (readonly string[])[]) {
  let top = Infinity;
  let right = -1;
  for (const f of frames)
    f.forEach((r, y) => {
      for (let x = 0; x < r.length; x++)
        if (r[x] !== ".") {
          top = Math.min(top, y);
          right = Math.max(right, x);
        }
    });
  return { top, right };
}

/**
 * Where an animation touches its surface: its own anchor, else a default. On the top edge (and everything but `climb`
 * and `hang`) that's the skin's anchor, whose pixel's bottom edge rests on the edge. `climb` faces a wall on its right
 * (mirrored on the card's right side): its anchor pixel's right edge touches the wall, and by default it's the
 * right-most opaque column at the top-most opaque row. `hang`'s anchor pixel's top edge touches the bottom edge: by
 * default the skin anchor's column at the top-most opaque row (M2 C3a).
 */
export function anchorOf(skin: Skin, name: AnimationName): Anchor {
  const own = animationOf(skin, name).anchor;
  if (own) return own;
  if (name !== "climb" && name !== "hang") return skin.anchor;
  const { top, right } = opaqueBounds(animationOf(skin, name).frames);
  if (top === Infinity) return skin.anchor; // an empty animation: nothing touches anything
  return name === "climb" ? { x: right, y: top } : { x: skin.anchor.x, y: top };
}
