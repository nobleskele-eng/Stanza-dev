// Where the companion goes on the card's outline (PLAN.md §4b, M2 C2, C3), and where it goes in the pointer's hand and
// when it's let go (C4a). Pure: CSS px and art px in, CSS px or art px out.
import type { Landing, Point } from "./brain";
import { anchorOf, type AnimationName, type Skin } from "./skin";

/** An edge in its container's CSS px: the line the creature stands on, from `left` for `width` px. */
export interface EdgeBox {
  left: number;
  top: number;
  width: number;
}

/** Anchor positions (art px) that fit on an edge `width` CSS px long. */
export const edgeLength = (width: number, px: number) => Math.max(1, Math.floor(width / px + 1e-9));

/** Opaque columns of the rows below `row` across a set of frames, relative to `ax`; null if there are none. */
function columnsBelow(frames: readonly (readonly string[])[], row: number, ax: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const f of frames)
    f.forEach((r, y) => {
      if (y <= row) return;
      for (let x = 0; x < r.length; x++)
        if (r[x] !== ".") {
          lo = Math.min(lo, x - ax);
          hi = Math.max(hi, x - ax);
        }
    });
  return lo === Infinity ? null : [lo, hi];
}

/**
 * Anchor positions (inclusive art-px ranges) where sitting would hang the creature's legs over a blocked stretch of
 * the edge. `blocked` are [from, to) CSS px from the edge's start: parts that reach up to the card's top (C2b). Both
 * facings are covered, so turning around never needs a re-check.
 */
export function noSitRanges(skin: Skin, blocked: readonly (readonly [number, number])[], px: number): [number, number][] {
  const a = anchorOf(skin, "sit");
  const below = columnsBelow(skin.animations.sit.frames, a.y, a.x);
  if (!below) return [];
  const [lo, hi] = [Math.min(below[0], -below[1]), Math.max(below[1], -below[0])];
  return blocked.map(([from, to]) => [Math.floor(from / px - 1 - hi) + 1, Math.ceil(to / px - lo) - 1]);
}

/** The sprite's top-left (CSS px, in the edge's container) for a pose: the anchor's pixel rests on the edge. */
export function placeOnEdge(skin: Skin, animation: AnimationName, x: number, facing: 1 | -1, px: number, edge: EdgeBox) {
  const a = anchorOf(skin, animation);
  const ax = facing > 0 ? a.x : skin.grid - 1 - a.x;
  return { left: edge.left + (x - ax) * px, top: edge.top - (a.y + 1) * px };
}

/** The card's box, in the creature's container's CSS px: the outline it can travel when it has one (C3a). */
export interface Outline {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where the creature is: the surface (an outline's side) and its anchor's position along it, art px. */
export type Surface = "top" | "right" | "bottom" | "left";

/**
 * The sprite's top-left (CSS px) and whether it's mirrored, for a pose anywhere on the outline (C3a). The top is
 * `placeOnEdge` on `top`. The bottom runs from the card's left like the top; the hang anchor's top edge touches it.
 * The sides run from the card's top down; the climb anchor's right edge touches the left side, and the art is
 * mirrored on the right side, whichever way it climbs.
 */
export function placeAround(
  skin: Skin,
  animation: AnimationName,
  surface: Surface,
  pos: number,
  facing: 1 | -1,
  px: number,
  top: EdgeBox,
  card: Outline,
): { left: number; top: number; mirrored: boolean } {
  const a = anchorOf(skin, animation);
  if (surface === "top") return { ...placeOnEdge(skin, animation, pos, facing, px, top), mirrored: facing < 0 };
  if (surface === "bottom") {
    const ax = facing > 0 ? a.x : skin.grid - 1 - a.x;
    return { left: card.left + (pos - ax) * px, top: card.top + card.height - a.y * px, mirrored: facing < 0 };
  }
  const y = card.top + (pos - a.y) * px;
  if (surface === "left") return { left: card.left - (a.x + 1) * px, top: y, mirrored: false };
  return { left: card.left + card.width - (skin.grid - 1 - a.x) * px, top: y, mirrored: true };
}

/** Opaque pixels' bounds across some animations' frames, art px, inclusive, as drawn facing right or mirrored. */
function opaqueBounds(skin: Skin, animations: readonly AnimationName[], mirrored: boolean) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const name of animations)
    for (const f of skin.animations[name].frames)
      f.forEach((r, y) => {
        for (let x = 0; x < r.length; x++)
          if (r[x] !== ".") {
            const mx = mirrored ? skin.grid - 1 - x : x;
            [x0, y0, x1, y1] = [Math.min(x0, mx), Math.min(y0, y), Math.max(x1, mx), Math.max(y1, y)];
          }
      });
  return { x0, y0, x1, y1 };
}

/** A box (CSS px) in art px from the card's top-left: [l, r) × [t, b). */
const artBox = (b: Outline, card: Outline, px: number) => ({
  l: (b.left - card.left) / px,
  t: (b.top - card.top) / px,
  r: (b.left + b.width - card.left) / px,
  b: (b.top + b.height - card.top) / px,
});
type ArtBox = ReturnType<typeof artBox>;
type Bounds = ReturnType<typeof opaqueBounds>;
const EPS = 1e-9;
/** Whether opaque bounds `o` with the sprite box at `p` cover any of `boxes`. */
const covers = (o: Bounds, p: Point, boxes: readonly ArtBox[]) =>
  boxes.some((b) => p.x + o.x0 < b.r - EPS && p.x + o.x1 + 1 > b.l + EPS && p.y + o.y0 < b.b - EPS && p.y + o.y1 + 1 > b.t + EPS);

/**
 * Where a carried creature's sprite box goes (C4a), in art px from the card's top-left (the brain's `Point`), for a
 * wanted top-left `want` (CSS px, the container's). Its held and fall art stay inside `room` and off every box in
 * `avoid` (the artwork: CLAUDE.md, nothing interactive over it), pushed out the shortest way that stays in the room.
 * It may go over the rest of the card (your call, 2026-11-01). Whole art px from the card's top-left, so its pixels
 * line up with the ones it stands on.
 */
export function carryPoint(
  skin: Skin,
  want: { left: number; top: number },
  mirrored: boolean,
  px: number,
  card: Outline,
  room: Outline,
  avoid: readonly Outline[] = [],
): Point {
  const o = opaqueBounds(skin, ["held", "fall"], mirrored);
  // The opaque box's top-left may go anywhere in [lo, hi], art px from the card's top-left.
  const lo = { x: Math.ceil((room.left - card.left) / px - EPS) - o.x0, y: Math.ceil((room.top - card.top) / px - EPS) - o.y0 };
  const hi = {
    x: Math.floor((room.left + room.width - card.left) / px + EPS) - o.x1 - 1,
    y: Math.floor((room.top + room.height - card.top) / px + EPS) - o.y1 - 1,
  };
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const x = clamp(Math.round((want.left - card.left) / px), lo.x, hi.x);
  const y = clamp(Math.round((want.top - card.top) / px), lo.y, hi.y);
  const boxes = avoid.map((b) => artBox(b, card, px));
  if (!covers(o, { x, y }, boxes)) return { x, y };
  const ways = boxes
    .flatMap((b) => [
      { x: Math.floor(b.l - o.x1 - 1 + EPS), y },
      { x: Math.ceil(b.r - o.x0 - EPS), y },
      { x, y: Math.floor(b.t - o.y1 - 1 + EPS) },
      { x, y: Math.ceil(b.b - o.y0 - EPS) },
    ])
    .filter((w) => w.x >= lo.x && w.x <= hi.x && w.y >= lo.y && w.y <= hi.y && !covers(o, w, boxes));
  const cost = (w: Point) => Math.abs(w.x - x) + Math.abs(w.y - y);
  // Something always fits (the room reaches past the card, C3b); if it didn't, above the card, clear of its insides.
  return ways.reduce((best, w) => (cost(w) < cost(best) ? w : best), ways[0] ?? { x, y: -o.y1 - 1 });
}

/** Feet this close below the top's line (art px) still catch it: the creature steps up onto it. */
const REACH = 3;

/**
 * Where a creature let go at `air` (art px from the card's top-left) ends up (C4a), and how it gets there. On the top
 * or the bottom it keeps facing the way it was; on a side it climbs back up. Gravity decides, by where its held and
 * fall art are:
 * - **Above the top's line:** the nearest surface (in the corners beside the top, maybe a side). The top it falls onto.
 * - **Over the card:** its feet within REACH of the top catch it. Lower, it falls down the card's face and catches the
 *   bottom edge, hanging. Something in `avoid` in the way (the artwork) stops the fall: it slides off the nearer side
 *   and falls on. Slid off the card's side, it grabs that side instead.
 * - **Beside the card or under it:** it grabs the nearest side, or the bottom, at once: nothing to fall onto.
 *
 * A landing it falls to has `via`: the turns on the way (none for a straight fall). Without `via` it's grabbed at once.
 * Without the outline (`card` null: the top only, or reduced motion) it's always the top.
 */
export function landingFor(
  skin: Skin,
  air: Point,
  facing: 1 | -1,
  px: number,
  top: EdgeBox,
  card: Outline | null,
  avoid: readonly Outline[] = [],
): Landing {
  const box = card ?? { left: top.left, top: top.top, width: top.width, height: 0 };
  const o = opaqueBounds(skin, ["held", "fall"], facing < 0);
  const cw = box.width / px;
  const ch = box.height / px;
  const overSpan = (p: Point) => p.x + o.x1 + 1 > EPS && p.x + o.x0 < cw - EPS;
  const feet = (p: Point) => p.y + o.y1 + 1;
  /** The landing on `surface` level with `from`, and how far its sprite box is from there. */
  const on = (surface: Surface, from: Point): { landing: Landing; far: number } => {
    const animation: AnimationName = surface === "top" ? "land" : surface === "bottom" ? "hang" : "climb";
    const a = anchorOf(skin, animation);
    const ax = facing > 0 ? a.x : skin.grid - 1 - a.x;
    const length = edgeLength(surface === "top" ? top.width : surface === "bottom" ? box.width : box.height, px);
    const along = surface === "top" || surface === "bottom" ? from.x + ax : from.y + a.y;
    const x = Math.max(0, Math.min(length - 1, Math.round(along)));
    const f: 1 | -1 = surface === "left" || surface === "right" ? -1 : facing;
    const p = placeAround(skin, animation, surface, x, f, px, top, box);
    const at = { x: (p.left - box.left) / px, y: (p.top - box.top) / px };
    return { landing: { surface, x, facing: f, at }, far: Math.hypot(at.x - from.x, at.y - from.y) };
  };
  /** The nearest of `surfaces`; ties go to the earlier one. */
  const nearest = (surfaces: Surface[], from: Point) =>
    surfaces.map((s) => on(s, from)).reduce((best, c) => (c.far < best.far - EPS ? c : best)).landing;

  if (!card) return { ...on("top", air).landing, via: [] };
  if (feet(air) <= EPS) {
    const landing = nearest(["top", "left", "right", "bottom"], air);
    // Feet already on the line, but the landing pose's anchor is lower in its grid: stepped onto, never fallen up to.
    return landing.surface === "top" && landing.at.y >= air.y - EPS ? { ...landing, via: [] } : landing;
  }
  if (overSpan(air) && feet(air) <= REACH + EPS) return on("top", air).landing;
  if (!overSpan(air) || air.y + o.y0 >= ch - EPS) return nearest(["left", "right", "bottom"], air);

  // Down the card's face, sliding off anything to avoid.
  const boxes = avoid.map((b) => artBox(b, box, px));
  const via: Point[] = [];
  let p = air;
  for (let guard = 0; guard < 8 && overSpan(p); guard++) {
    const below = boxes
      .filter((b) => b.l < p.x + o.x1 + 1 - EPS && b.r > p.x + o.x0 + EPS && b.t >= feet(p) - EPS && b.t < ch)
      .sort((a, b) => a.t - b.t)[0];
    if (!below) break;
    const y = Math.floor(below.t - o.y1 - 1 + EPS);
    const left = Math.floor(below.l - o.x1 - 1 + EPS);
    const right = Math.ceil(below.r - o.x0 - EPS);
    const x = p.x - left <= right - p.x ? left : right;
    if (y !== p.y) via.push({ x: p.x, y });
    p = { x, y };
    via.push(p);
  }
  if (!overSpan(p)) return { ...nearest(["left", "right"], p), via };
  const hang = on("bottom", p).landing;
  // Straight down to the bottom's level, then along under the card if its end held it back: never across the card.
  if (Math.abs(hang.at.x - p.x) > EPS) via.push({ x: p.x, y: hang.at.y });
  return { ...hang, via };
}

/** How far (CSS px) the sitting pose's legs hang below the edge: from the anchor row to the lowest opaque row. */
export function sitDepth(skin: Skin, px: number): number {
  const a = anchorOf(skin, "sit");
  let lowest = a.y;
  for (const f of skin.animations.sit.frames)
    f.forEach((r, y) => {
      if (/[^.]/.test(r)) lowest = Math.max(lowest, y);
    });
  return (lowest - a.y) * px;
}
