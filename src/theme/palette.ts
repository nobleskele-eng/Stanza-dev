// Artwork palette extraction (PLAN.md "Artwork and colour"; THEME_CONTRACT.md
// `--mp-art-1..3` / `--mp-art-fg`). Client-side (canvas), not the Rust ArtworkService
// PLAN.md describes — no real Spotify adapter exists yet to feed one, and the Phase 3
// gate runs against the Vite dev server, not a Tauri runtime (D-2026-09-22 in
// DECISIONS.md). `--mp-art-fg` is chosen from pure white/black against `--mp-art-1`,
// which is mathematically guaranteed to clear WCAG AA 4.5:1 against ANY background
// (the worst case, where both candidates tie, still exceeds 4.5:1) — see
// `palette.test.ts` for the proof-by-sweep.

import { contrastRatio, type Rgb } from "./contrast";

export interface ArtPalette {
  art1: string;
  art2: string;
  art3: string;
  artFg: string;
}

interface RawImageData {
  data: Uint8ClampedArray | number[];
  width: number;
  height: number;
}

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

function toHex([r, g, b]: Rgb): string {
  const c = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/**
 * Buckets pixels into a coarse color space (4 bits/channel) and returns the centroid
 * (average actual color) of the 3 most populous buckets, most-populous first. Ignores
 * near-transparent pixels. Pure function — no canvas — so it's unit-testable directly.
 */
export function extractPalette(image: RawImageData): ArtPalette {
  const { data, width, height } = image;
  const total = width * height;
  const buckets = new Map<number, { r: number; g: number; b: number; count: number }>();

  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const a = data[o + 3];
    if (a < 16) continue; // skip near-transparent pixels
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    // 4 bits/channel = 4096 buckets, coarse enough to group near-duplicate colors.
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.count += 1;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }

  const ranked = [...buckets.values()].sort((a, b) => b.count - a.count);
  const centroid = (b: { r: number; g: number; b: number; count: number }): Rgb => [
    b.r / b.count,
    b.g / b.count,
    b.b / b.count,
  ];

  // Fully transparent image (or 0x0): fall back to mid-grey rather than throwing.
  const fallback: Rgb = [128, 128, 128];
  const top: Rgb[] = [
    ranked[0] ? centroid(ranked[0]) : fallback,
    ranked[1] ? centroid(ranked[1]) : ranked[0] ? centroid(ranked[0]) : fallback,
    ranked[2] ? centroid(ranked[2]) : ranked[1] ? centroid(ranked[1]) : ranked[0] ? centroid(ranked[0]) : fallback,
  ];

  const art1 = top[0];
  const artFg = contrastRatio(art1, WHITE) >= contrastRatio(art1, BLACK) ? WHITE : BLACK;

  return {
    art1: toHex(art1),
    art2: toHex(top[1]),
    art3: toHex(top[2]),
    artFg: toHex(artFg),
  };
}

/** Browser-only: rasterizes `img` to an offscreen canvas and extracts its palette. */
export async function extractPaletteFromImage(img: HTMLImageElement): Promise<ArtPalette | null> {
  try {
    // Downscale — palette extraction doesn't need full resolution and this keeps
    // getImageData cheap regardless of the source image's actual size.
    const size = 48;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const imageData = ctx.getImageData(0, 0, size, size); // throws if canvas is tainted (cross-origin)
    return extractPalette(imageData);
  } catch {
    // Cross-origin artwork with no CORS headers taints the canvas — the exact case
    // PLAN.md flags for a future macOS/AppleScript URL. Degrade gracefully: no
    // --mp-art-* this track, themes already require a fallback for that.
    return null;
  }
}

/** Loads `url` (a `data:` URL or same-origin/CORS-enabled URL) and extracts its palette. */
export async function extractPaletteFromUrl(url: string): Promise<ArtPalette | null> {
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = url;
  });
  return img ? extractPaletteFromImage(img) : null;
}
