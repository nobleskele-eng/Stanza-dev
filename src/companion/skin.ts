// Companion skin format, version 2 (docs/COMPANION.md; PLAN.md §4b). A skin is one creature: its
// grid, palettes and the frames of every required animation. Validation returns machine codes and
// paths, never prose (displayed strings come from COPY.md, CLAUDE.md), like src/theme/variant.ts.

export const SKIN_FORMAT = 2;

/** Every skin must have all of these (the C2 brain's states). */
export const REQUIRED_ANIMATIONS = ["idle", "walk", "sit", "climb", "hang", "sleep", "wake", "react", "held", "fall", "land"] as const;
export type AnimationName = (typeof REQUIRED_ANIMATIONS)[number];

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
}

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
  animations: Record<AnimationName, SkinAnimation>;
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
  | "slot-out-of-range";

export interface SkinIssue {
  code: SkinIssueCode;
  path: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const TOP_KEYS = ["id", "name", "format", "grid", "anchor", "palettes", "animations"];
const ANIMATION_KEYS = ["fps", "loop", "frames", "durations", "steps", "anchor"];
const isAnchor = (v: unknown, grid: number | null) =>
  isObject(v) && Object.keys(v).every((k) => k === "x" || k === "y") && grid !== null && isInt(v.x, 0, grid - 1) && isInt(v.y, 0, grid - 1);
export const MIN_FRAME_MS = 50;
export const MAX_FRAME_MS = 10_000;

/** Checks a parsed `companion.json`. A skin with any issue is rejected whole: it must render every state. */
export function validateSkin(raw: unknown): { skin: Skin | null; issues: SkinIssue[] } {
  const issues: SkinIssue[] = [];
  const add = (code: SkinIssueCode, path: string) => issues.push({ code, path });
  if (!isObject(raw)) return { skin: null, issues: [{ code: "not-an-object", path: "" }] };

  for (const key of Object.keys(raw)) if (!TOP_KEYS.includes(key)) add("unknown-key", key);
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
      for (const name of Object.keys(raw.animations))
        if (!(REQUIRED_ANIMATIONS as readonly string[]).includes(name)) add("unknown-key", `animations.${name}`);
      for (const name of REQUIRED_ANIMATIONS) {
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
      }
    }
  }

  return { skin: issues.length ? null : (raw as unknown as Skin), issues };
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

/** Art pixels the creature moves forward on entering frame `i` (`steps`; absent: 1 for `walk`, else 0). */
export const stepPx = (name: AnimationName, anim: SkinAnimation, i: number) => anim.steps?.[i] ?? (name === "walk" ? 1 : 0);

/** Where an animation rests on its surface: its own anchor, else the skin's. */
export const anchorOf = (skin: Skin, name: AnimationName): Anchor => skin.animations[name].anchor ?? skin.anchor;
