// Pixel-art scale for the companion (PLAN.md §4b; measured in the C0 spike and C1, docs/DECISIONS.md).

/**
 * Logical px per art pixel: always a whole number of device pixels (2 at 100%, 3 at 125% and 150%,
 * 4 at 200%), so no art pixel is ever split across device pixels.
 */
export function artPixelPx(dpr: number): number {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Math.max(1, Math.round(2 * ratio)) / ratio;
}

/** The art's own size (logical px) for a `grid`×`grid` skin. Often fractional: 38.4 at 125%. */
export const spriteSizePx = (grid: number, dpr: number) => grid * artPixelPx(dpr);

/**
 * Layout lengths that are multiples of this many CSS px are stored exactly in the engines' 1/64 px layout units,
 * and are whole device px at every quarter-step scaling (100–200%). Other lengths get truncated: 38.4 is stored as
 * 38.390625, and Chromium then blends the art's last device row into the backdrop (C1, docs/DECISIONS.md).
 */
export const LAYOUT_GRID = 4;

/**
 * A sprite's layout box (logical px): the art's size rounded up to LAYOUT_GRID. The art sits at the box's top-left,
 * and the spare strip on the right and bottom (2 device px at 125%) stays transparent.
 */
export const spriteBoxPx = (grid: number, pixel: number) => Math.ceil((grid * pixel) / LAYOUT_GRID - 1e-9) * LAYOUT_GRID;
