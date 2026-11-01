// Where the companion's surfaces are, measured from the player's real parts (PLAN.md §4b, M2 C2b, C3b, C5a). Pure:
// boxes in, boxes out, all in one coordinate space (CSS px of the viewport, which the pet's fixed layer shares).
import { FLOOR_ANIMATIONS, edgeLength, opaqueBounds, placeOnEdge, sitDepth, type EdgeBox, type Outline } from "./place";
import type { Skin } from "./skin";

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The card's outline (the pet climbs outside its sides and hangs under its bottom), the top edge it walks (the
 * card's whole top: the window's margin on every side leaves the corners room, C3b), and the stretches of the top
 * where sitting would hang its legs over a part. `parts` are the player's artwork, text, controls and source badge:
 * any that reaches up into the legs' depth below the card's top blocks the stretch it spans (`noSitRanges` turns that
 * into anchor positions). Blocked stretches are relative to the edge's start.
 */
export function measureOutline(skin: Skin, card: Box, parts: readonly Box[], px: number) {
  const outline: Outline = { left: card.left, top: card.top, width: Math.max(px, card.right - card.left), height: Math.max(px, card.bottom - card.top) };
  const edge: EdgeBox = { left: outline.left, top: outline.top, width: outline.width };
  const reach = card.top + sitDepth(skin, px);
  const blocked: [number, number][] = parts
    .filter((b) => b.right > b.left && b.bottom > b.top && b.bottom > card.top && b.top < reach)
    .map((b): [number, number] => [b.left - edge.left, b.right - edge.left])
    .sort((a, b) => a[0] - b[0]);
  // Merge touching or overlapping stretches, so the same layout always gives the same key.
  const merged: [number, number][] = [];
  for (const r of blocked) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return { outline, edge, blocked: merged };
}

/** A side of the card a shelf touches: the creature steps on and off it there, from a climb (C5a). */
export type Door = "left" | "right";

/** A shelf the creature can use: its line, trimmed to where it fits (same px), and the sides it's reached from. */
export interface Shelf {
  edge: EdgeBox;
  doors: Door[];
}

/**
 * The part of a shelf (C5a: a line inside the card, `line`) the creature can stand on: the positions where none of its
 * floor poses, facing either way, would put an opaque pixel over a part. Of those, the stretch reaching a side of the
 * card (a door: within an art pixel of it), so it can always get on and off. Null when no stretch reaches a side: a
 * shelf it could only be dropped onto would keep it there.
 */
export function measureShelf(skin: Skin, card: Box, line: EdgeBox, parts: readonly Box[], px: number): Shelf | null {
  const n = edgeLength(line.width, px);
  const solid = parts.filter((b) => b.right > b.left && b.bottom > b.top);
  const E = 1e-9;
  const bounds = FLOOR_ANIMATIONS.flatMap((animation) =>
    ([1, -1] as const).map((facing) => ({ animation, facing, o: opaqueBounds(skin, [animation], facing < 0) })),
  );
  const fits = (s: number) =>
    bounds.every(({ animation, facing, o }) => {
      const at = placeOnEdge(skin, animation, s, facing, px, line);
      const art = { left: at.left + o.x0 * px, top: at.top + o.y0 * px, right: at.left + (o.x1 + 1) * px, bottom: at.top + (o.y1 + 1) * px };
      return !solid.some((b) => art.left < b.right - E && art.right > b.left + E && art.top < b.bottom - E && art.bottom > b.top + E);
    });
  const clear = Array.from({ length: n }, (_, s) => fits(s));
  const run = (from: number, step: 1 | -1) => {
    let s = from;
    while (s + step >= 0 && s + step < n && clear[s + step]) s += step;
    return s;
  };
  const touches = { left: Math.abs(line.left - card.left) < px, right: Math.abs(line.left + line.width - card.right) < px };
  // One stretch: the one from the left door if it has one, else from the right door.
  const start = touches.left && clear[0] ? 0 : touches.right && clear[n - 1] ? run(n - 1, -1) : null;
  if (start === null) return null;
  const end = run(start, 1);
  const doors: Door[] = [];
  if (touches.left && start === 0) doors.push("left");
  if (touches.right && end === n - 1) doors.push("right");
  return { edge: { left: line.left + start * px, top: line.top, width: (end - start + 1) * px }, doors };
}

/**
 * A theme's shelf line (contract v10): level with the base of the part it's declared beside, from the card's `side`
 * to that part's near edge. Null when the part isn't rendered (or has no area), or leaves no room on that side.
 */
export function shelfLine(side: Door, card: Box, beside: Box | null): EdgeBox | null {
  if (!beside || beside.right <= beside.left || beside.bottom <= beside.top) return null;
  const from = side === "left" ? card.left : beside.right;
  const to = side === "left" ? beside.left : card.right;
  return to > from ? { left: from, top: beside.bottom, width: to - from } : null;
}
