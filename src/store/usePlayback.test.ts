import { describe, expect, it } from "vitest";
import { msToNextSecond } from "./usePlayback";

describe("msToNextSecond", () => {
  it("is the time until the shown m:ss changes", () => {
    expect(msToNextSecond(0)).toBe(1000);
    expect(msToNextSecond(42_250)).toBe(750);
    expect(msToNextSecond(42_999)).toBe(1);
    expect(msToNextSecond(43_000)).toBe(1000);
  });

  it("treats a negative position as 0 (never a zero or negative wait)", () => {
    expect(msToNextSecond(-300)).toBe(1000);
  });
});
