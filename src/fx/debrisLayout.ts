// Pure helpers for the "old title spills out" physics debris (design round 2, step 6). The DOM and
// Matter.js parts live in Debris.tsx; everything that can be decided without them is here so it is
// unit-tested. Nothing invents text: the pieces are letters of the title that was just replaced.

import { graphemes } from "./flap";

/** Hard cap on physics bodies per spill (the plan's "≤ ~40"). */
export const MAX_DEBRIS = 32;
/** Total lifetime of one spill: simulate, fade, then everything is destroyed. */
export const DEBRIS_MS = 2800;
/** When the fade-out starts within DEBRIS_MS. */
export const DEBRIS_FADE_AT_MS = 2000;

export interface DebrisGlyph {
  ch: string;
  /** left edge of the glyph, in px, within the row (spaces advance the row but are not bodies) */
  x: number;
  w: number;
}

/**
 * Lays the title out as one row with the injected `measure` (canvas measureText in the browser),
 * keeps at most `max` visible glyphs, and centres the row inside a box of `boxWidth` starting at
 * `boxLeft`. Whitespace advances the row but never becomes a body. Returns the glyphs in order.
 */
export function layoutDebris(
  title: string,
  measure: (ch: string) => number,
  boxLeft: number,
  boxWidth: number,
  max = MAX_DEBRIS,
): DebrisGlyph[] {
  const all = graphemes(title);
  const items: { ch: string; x: number; w: number; visible: boolean }[] = [];
  let x = 0;
  let visible = 0;
  for (const ch of all) {
    const w = Math.max(0, measure(ch));
    const isSpace = /^\s+$/.test(ch);
    if (!isSpace && visible >= max) break; // stop once the cap of visible glyphs is reached
    items.push({ ch, x, w, visible: !isSpace });
    if (!isSpace) visible += 1;
    x += w;
  }
  const rowWidth = x;
  const offset = boxLeft + (boxWidth - rowWidth) / 2;
  return items.filter((i) => i.visible).map((i) => ({ ch: i.ch, x: offset + i.x, w: i.w }));
}

/** Only the glyph characters, for tests and assertions. */
export const glyphChars = (glyphs: readonly DebrisGlyph[]): string => glyphs.map((g) => g.ch).join("");
