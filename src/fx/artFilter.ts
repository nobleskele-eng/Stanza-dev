// Live artwork treatments (design round 2, step 2). SVG filter *attributes* (tableValues) can't
// read CSS variables, so the app computes the colours here from the extracted palette and
// renders the filter defs itself (FxFilters); a theme just says `filter: url(#mp-art-duotone)`.
// Pure functions only, so they're unit-tested without a DOM.

import { contrastRatio, parseColor, relativeLuminance, type Rgb } from "../theme/contrast";

export const ART_FILTER_IDS = {
  duotone: "mp-art-duotone",
  posterize: "mp-art-posterize",
  dither: "mp-art-dither",
} as const;

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as Rgb;

const saturation = ([r, g, b]: Rgb): number => {
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
};

export interface Duotone {
  dark: Rgb;
  light: Rgb;
}

/**
 * Picks the shadow/highlight pair from the palette: the darkest colour pushed toward black, the
 * most saturated (else lightest) pushed toward white, so the two always separate strongly (≥ 4:1) even when the artwork's
 * three dominant colours are all mid-tones. With no palette (no artwork, still loading, tainted
 * canvas) it returns plain black/white, i.e. an ordinary greyscale.
 */
export function pickDuotone(colors: ReadonlyArray<string | null | undefined>): Duotone {
  const parsed = colors.flatMap((c) => {
    const rgb = c ? parseColor(c) : null;
    return rgb ? [rgb] : [];
  });
  if (parsed.length === 0) return { dark: BLACK, light: WHITE };
  const byLum = [...parsed].sort((a, b) => relativeLuminance(a) - relativeLuminance(b));
  const dark = mix(byLum[0], BLACK, 0.55);
  // Highlights: the most saturated palette colour (lifted toward white) when the artwork has a real
  // accent, so the treatment carries its hue instead of collapsing to the dominant near-black /
  // near-white; otherwise simply the lightest colour.
  const accent = [...parsed].sort((a, b) => saturation(b) - saturation(a))[0];
  const source = saturation(accent) >= 0.25 ? accent : byLum[byLum.length - 1];
  for (const light of [mix(source, WHITE, 0.4), mix(byLum[byLum.length - 1], WHITE, 0.35)]) {
    if (contrastRatio(dark, light) >= 4) return { dark, light };
  }
  return { dark: BLACK, light: WHITE };
}

/** `tableValues` for one channel's two-stop feFuncX table: "dark light", each in 0..1. */
export function channelTable(dark: number, light: number): string {
  return `${(dark / 255).toFixed(3)} ${(light / 255).toFixed(3)}`;
}

export function duotoneTables({ dark, light }: Duotone): { r: string; g: string; b: string } {
  return { r: channelTable(dark[0], light[0]), g: channelTable(dark[1], light[1]), b: channelTable(dark[2], light[2]) };
}

/**
 * Ordered-dither threshold matrix (Bayer), n a power of two. Values are the ranks 0..n²-1 laid out
 * so neighbouring cells differ maximally — the standard recursive construction.
 */
export function bayerMatrix(n: number): number[][] {
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error("n must be a power of two >= 2");
  let m = [[0, 2], [3, 1]];
  while (m.length < n) {
    const s = m.length;
    const next: number[][] = Array.from({ length: s * 2 }, () => new Array<number>(s * 2).fill(0));
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const v = m[y][x] * 4;
        next[y][x] = v;
        next[y][x + s] = v + 2;
        next[y + s][x] = v + 3;
        next[y + s][x + s] = v + 1;
      }
    }
    m = next;
  }
  return m;
}

/** Threshold in (0,1) for each Bayer cell — the grey level baked into the dither tile. */
export function bayerThresholds(n: number): number[][] {
  const total = n * n;
  return bayerMatrix(n).map((row) => row.map((v) => (v + 0.5) / total));
}

/**
 * A tiny PNG data URL of the Bayer tile, built at runtime on a canvas (our own pattern, not a copy
 * of anyone's). Returns null where a canvas isn't available (tests / SSR); the dither filter then
 * simply degrades to a hard black/white threshold.
 */
export function ditherTileDataUrl(n = 8): string | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(n, n);
  bayerThresholds(n).forEach((row, y) =>
    row.forEach((t, x) => {
      const i = (y * n + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(t * 255);
      img.data[i + 3] = 255;
    }),
  );
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}
