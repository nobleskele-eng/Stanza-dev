import { describe, expect, it } from "vitest";
import { contrastRatio } from "../theme/contrast";
import { bayerMatrix, bayerThresholds, channelTable, duotoneTables, pickDuotone } from "./artFilter";

describe("pickDuotone", () => {
  it("falls back to plain black/white when there is no usable palette", () => {
    for (const none of [[], [null, undefined, ""], ["not a colour"]]) {
      expect(pickDuotone(none)).toEqual({ dark: [0, 0, 0], light: [255, 255, 255] });
    }
  });

  it("always separates shadows from highlights by >= 4:1, even from all-mid-tone palettes", () => {
    const palettes = [
      ["#808080", "#7a7a7a", "#858585"],
      ["#ff0000", "#00ff00", "#0000ff"],
      ["#101010", "#f0f0f0", "#888888"],
      ["rgb(120, 90, 60)", "rgb(130, 95, 70)", "rgb(125, 92, 65)"],
    ];
    for (const p of palettes) {
      const { dark, light } = pickDuotone(p);
      expect(contrastRatio(dark, light)).toBeGreaterThanOrEqual(4);
    }
  });

  it("puts the darkest palette colour in the shadows and the most saturated (lifted) in the highlights", () => {
    const { dark, light } = pickDuotone(["#3060c0", "#e0c040", "#804080"]);
    // Darkest of the three by luminance is the purple #804080 (not the brighter blue), pushed
    // toward black: still purple-ish (red == blue, green lower), not a neutral grey.
    expect(dark[0]).toBe(dark[2]);
    expect(dark[1]).toBeLessThan(dark[0]);
    // Highlights now come from the most saturated colour (the blue #3060c0), lifted toward white.
    expect(light[2]).toBeGreaterThan(light[0]);
    expect(light[2]).toBeGreaterThan(200);
  });
});

describe("pickDuotone accent", () => {
  it("carries the artwork's accent hue into the highlights instead of the dominant cream", () => {
    // Real palette from the colourful fixture: navy, a red accent, cream.
    const { dark, light } = pickDuotone(["#1b1f3b", "#d45657", "#f4f1de"]);
    expect(light[0]).toBeGreaterThan(light[2]); // red-ish highlight, not neutral cream
    expect(light[0]).toBeGreaterThan(200);
    expect(dark[2]).toBeGreaterThan(dark[0]); // navy shadows
  });

  it("uses the lightest colour when nothing in the palette is really saturated", () => {
    const { light } = pickDuotone(["#202020", "#808080", "#f0f0f0"]);
    expect(Math.abs(light[0] - light[1])).toBeLessThan(3);
    expect(Math.abs(light[1] - light[2])).toBeLessThan(3);
  });
});

describe("duotone tables", () => {
  it("formats two-stop 0..1 tables per channel", () => {
    expect(channelTable(0, 255)).toBe("0.000 1.000");
    expect(duotoneTables({ dark: [0, 51, 102], light: [255, 204, 153] })).toEqual({
      r: "0.000 1.000",
      g: "0.200 0.800",
      b: "0.400 0.600",
    });
  });
});

describe("Bayer dither matrix", () => {
  it("is a permutation of 0..n²-1 for every supported size", () => {
    for (const n of [2, 4, 8, 16]) {
      const flat = bayerMatrix(n).flat().sort((a, b) => a - b);
      expect(flat).toEqual(Array.from({ length: n * n }, (_, i) => i));
    }
  });

  it("matches the known 4x4 ordered-dither matrix", () => {
    expect(bayerMatrix(4)).toEqual([
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5],
    ]);
  });

  it("thresholds sit strictly inside (0,1) and are all distinct", () => {
    const t = bayerThresholds(8).flat();
    expect(new Set(t).size).toBe(64);
    for (const v of t) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("rejects sizes that are not a power of two", () => {
    expect(() => bayerMatrix(3)).toThrow();
    expect(() => bayerMatrix(1)).toThrow();
  });
});
