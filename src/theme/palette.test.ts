import { describe, expect, it } from "vitest";
import { contrastRatio, parseColor, WCAG_AA_NORMAL } from "./contrast";
import { extractPalette } from "./palette";

function flatImage(width: number, height: number, [r, g, b, a = 255]: number[]): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data.set([r, g, b, a], i * 4);
  }
  return { data, width, height };
}

function imageFromPixels(width: number, height: number, pixels: number[][]): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach(([r, g, b, a = 255], i) => data.set([r, g, b, a], i * 4));
  return { data, width, height };
}

describe("extractPalette", () => {
  it("returns the flat color for art1/2/3 on a single-color image", () => {
    const p = extractPalette(flatImage(4, 4, [250, 250, 250]));
    expect(p.art1).toBe("#fafafa");
    expect(p.art2).toBe("#fafafa");
    expect(p.art3).toBe("#fafafa");
  });

  it("picks the most frequent color as art1", () => {
    // 3 red pixels, 1 blue pixel, in a 2x2 image.
    const img = imageFromPixels(2, 2, [
      [220, 20, 20],
      [220, 20, 20],
      [220, 20, 20],
      [20, 20, 220],
    ]);
    const p = extractPalette(img);
    expect(p.art1).toBe("#dc1414");
    expect(p.art2).toBe("#1414dc");
  });

  it("ignores near-transparent pixels", () => {
    const img = imageFromPixels(2, 1, [
      [10, 200, 10, 255],
      [255, 0, 0, 0], // fully transparent — must not win despite being a distinct color
    ]);
    const p = extractPalette(img);
    expect(p.art1).toBe("#0ac80a");
  });

  it("degrades to grey instead of throwing on a fully transparent image", () => {
    const p = extractPalette(flatImage(2, 2, [255, 0, 0, 0]));
    expect(p.art1).toBe("#808080");
  });

  it("never throws on a 0x0 image", () => {
    expect(() => extractPalette({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).not.toThrow();
  });

  // The Phase 3 gate (PLAN.md): "text on --mp-art-fg meets WCAG AA 4.5:1". artFg is
  // chosen as whichever of pure white/black has higher contrast against art1 — proof
  // by sweep that this always clears AA, across the full lightness range including the
  // worst case (~L 0.18) where white and black are nearly tied.
  it("artFg always meets WCAG AA 4.5:1 against art1, across the full lightness range", () => {
    for (let gray = 0; gray <= 255; gray += 3) {
      const p = extractPalette(flatImage(1, 1, [gray, gray, gray]));
      const art1 = parseColor(p.art1)!;
      const artFg = parseColor(p.artFg)!;
      expect(contrastRatio(art1, artFg), `gray(${gray}): art1=${p.art1} artFg=${p.artFg}`).toBeGreaterThanOrEqual(
        WCAG_AA_NORMAL,
      );
    }
  });

  it("artFg meets AA against saturated, non-grey art1 colors too", () => {
    const colors: number[][] = [
      [220, 20, 60], // crimson
      [30, 144, 255], // dodger blue
      [255, 215, 0], // gold
      [0, 100, 0], // dark green
      [128, 0, 128], // purple
    ];
    for (const [r, g, b] of colors) {
      const p = extractPalette(flatImage(1, 1, [r, g, b]));
      const art1 = parseColor(p.art1)!;
      const artFg = parseColor(p.artFg)!;
      expect(contrastRatio(art1, artFg)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    }
  });
});
