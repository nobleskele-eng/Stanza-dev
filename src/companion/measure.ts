// Where the companion's surfaces are, measured from the player's real parts (PLAN.md §4b, M2 C2b, C3b). Pure: boxes
// in, boxes out, all in one coordinate space (CSS px of the viewport, which the pet's fixed layer shares).
import { sitDepth, type EdgeBox, type Outline } from "./place";
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
