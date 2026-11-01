// Where the companion goes on the card's outline (PLAN.md §4b, M2 C2, C3). Pure: CSS px and art px in, CSS px out.
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

/**
 * Where a carried creature's sprite box goes (C4a), in art px from the card's top-left (the brain's `Point`), for a
 * wanted top-left `want` (CSS px, the container's). Its held and fall art stay inside `room` and off the card, so it's
 * never over a part, even in the pointer's hand: pushed out of the card the shortest way that stays in the room.
 * Whole art px from the card's top-left, so its pixels line up with the ones it stands on.
 */
export function carryPoint(skin: Skin, want: { left: number; top: number }, mirrored: boolean, px: number, card: Outline, room: Outline) {
  const o = opaqueBounds(skin, ["held", "fall"], mirrored);
  // The opaque box's top-left may go anywhere in [lo, hi], art px from the card's top-left.
  const lo = { x: Math.ceil((room.left - card.left) / px - 1e-9) - o.x0, y: Math.ceil((room.top - card.top) / px - 1e-9) - o.y0 };
  const hi = {
    x: Math.floor((room.left + room.width - card.left) / px + 1e-9) - o.x1 - 1,
    y: Math.floor((room.top + room.height - card.top) / px + 1e-9) - o.y1 - 1,
  };
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const x = clamp(Math.round((want.left - card.left) / px), lo.x, hi.x);
  const y = clamp(Math.round((want.top - card.top) / px), lo.y, hi.y);
  // The card in the same units: the opaque box is off it when it ends at or before one side or starts at or after
  // the other.
  const cw = Math.ceil(card.width / px - 1e-9);
  const ch = Math.ceil(card.height / px - 1e-9);
  const over = x + o.x1 >= 0 && x + o.x0 < cw && y + o.y1 >= 0 && y + o.y0 < ch;
  if (!over) return { x, y };
  const ways = [
    { x: -o.x1 - 1, y },
    { x: cw - o.x0, y },
    { x, y: -o.y1 - 1 },
    { x, y: ch - o.y0 },
  ].filter((w) => w.x >= lo.x && w.x <= hi.x && w.y >= lo.y && w.y <= hi.y);
  const cost = (w: { x: number; y: number }) => Math.abs(w.x - x) + Math.abs(w.y - y);
  // The room always reaches past the card on some side (the window's margin, C3b); if it didn't, above the card.
  return ways.reduce((best, w) => (cost(w) < cost(best) ? w : best), ways[0] ?? { x, y: -o.y1 - 1 });
}

/**
 * Where a creature let go at `air` (art px from the card's top-left) ends up (C4a): the surface nearest its sprite
 * box, and its position there. On the top or the bottom it keeps facing the way it was; on a side it climbs back up.
 * It falls onto the top only from above it (its held and fall art clear of the top's line), so a fall never crosses
 * the card; from beside or below, it grabs a side or the bottom. Without the outline (`card` null: the top only, or
 * reduced motion) it's always the top.
 */
export function landingFor(skin: Skin, air: { x: number; y: number }, facing: 1 | -1, px: number, top: EdgeBox, card: Outline | null) {
  const box = card ?? { left: top.left, top: top.top, width: top.width, height: 0 };
  const above = air.y + opaqueBounds(skin, ["held", "fall"], facing < 0).y1 + 1 <= 1e-9;
  const along = (animation: AnimationName, surface: Surface) => {
    const a = anchorOf(skin, animation);
    const ax = facing > 0 ? a.x : skin.grid - 1 - a.x;
    const length = edgeLength(surface === "top" ? top.width : surface === "bottom" ? box.width : box.height, px);
    const at = surface === "top" || surface === "bottom" ? air.x + ax : air.y + a.y;
    return Math.max(0, Math.min(length - 1, Math.round(at)));
  };
  const options: [Surface, AnimationName][] = !card || above ? [["top", "land"]] : [];
  if (card) options.push(["left", "climb"], ["right", "climb"], ["bottom", "hang"]);
  let best: { surface: Surface; x: number; facing: 1 | -1; at: { x: number; y: number } } | null = null;
  let bestFar = Infinity;
  for (const [surface, animation] of options) {
    const x = along(animation, surface);
    const f: 1 | -1 = surface === "left" || surface === "right" ? -1 : facing;
    const p = placeAround(skin, animation, surface, x, f, px, top, box);
    const at = { x: (p.left - box.left) / px, y: (p.top - box.top) / px };
    const far = Math.hypot(at.x - air.x, at.y - air.y);
    // Ties go to the earlier surface: the top first.
    if (far < bestFar - 1e-9) [best, bestFar] = [{ surface, x, facing: f, at }, far];
  }
  return best!;
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
