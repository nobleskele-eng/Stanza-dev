import { describe, expect, it } from "vitest";
import { formatMs, progressFraction } from "./format";

describe("formatMs", () => {
  it("formats sub-minute durations as 0:ss", () => {
    expect(formatMs(45_000)).toBe("0:45");
  });

  it("formats minutes:seconds, zero-padded", () => {
    expect(formatMs(82_000)).toBe("1:22");
  });

  it("formats past an hour as h:mm:ss", () => {
    expect(formatMs(3_722_000)).toBe("1:02:02");
  });

  it("clamps negative input to 0:00 instead of a negative timecode", () => {
    expect(formatMs(-500)).toBe("0:00");
  });
});

describe("progressFraction", () => {
  it("computes position/duration", () => {
    expect(progressFraction(30_000, 120_000)).toBe(0.25);
  });

  it("returns 0 when duration is unknown", () => {
    expect(progressFraction(30_000, undefined)).toBe(0);
  });

  it("clamps to [0, 1] instead of overshooting", () => {
    expect(progressFraction(150_000, 120_000)).toBe(1);
    expect(progressFraction(-10, 120_000)).toBe(0);
  });
});
