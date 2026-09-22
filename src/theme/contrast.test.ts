import { describe, expect, it } from "vitest";
import { contrastRatio, parseColor } from "./contrast";

describe("parseColor", () => {
  it("parses 6- and 3-digit hex", () => {
    expect(parseColor("#0b0b0d")).toEqual([11, 11, 13]);
    expect(parseColor("#fff")).toEqual([255, 255, 255]);
  });

  it("parses browser rgb()/rgba() output", () => {
    expect(parseColor("rgb(242, 240, 234)")).toEqual([242, 240, 234]);
    expect(parseColor("rgba(0, 0, 0, 0.5)")).toEqual([0, 0, 0]);
  });

  it("parses color(srgb …) as reported for color-mix() results", () => {
    const [r, g, b] = parseColor("color(srgb 1 0.5 0)")!;
    expect([r, g, b]).toEqual([255, 127.5, 0]);
  });

  it("returns null for anything else", () => {
    expect(parseColor("red")).toBeNull();
    expect(parseColor("#12")).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white and symmetric", () => {
    const black = parseColor("#000")!;
    const white = parseColor("#fff")!;
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, black)).toBeCloseTo(21, 5);
  });

  it("is 1 for identical colors", () => {
    const c = parseColor("#c1432e")!;
    expect(contrastRatio(c, c)).toBeCloseTo(1, 5);
  });
});
