// Where the companion goes on an edge (PLAN.md §4b, M2 C2). Pure: CSS px and art px in, CSS px out.
import { anchorOf, REQUIRED_ANIMATIONS, type AnimationName, type Skin } from "./skin";

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

/**
 * How far (CSS px) the sprite can reach sideways of an anchor position, in any pose and either facing. The edge it
 * walks is the card's top edge shortened by this at both ends, so no pose ever pokes out past the card's sides and
 * into the window's clip (C2b; C3 adds side margins and lifts this).
 */
export function edgeInset(skin: Skin, px: number): number {
  let reach = 0;
  for (const name of REQUIRED_ANIMATIONS) {
    const a = anchorOf(skin, name);
    reach = Math.max(reach, a.x, skin.grid - 1 - a.x);
  }
  return reach * px;
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
