import { describe, expect, it } from "vitest";
import { BPM_MAX, BPM_MIN, beatAt, hashString, rhythmFor, waveformPeaks } from "./beat";

const TITLES = ["a", "Track One", "夜に駆ける", "x".repeat(200), ""];

describe("rhythmFor", () => {
  it("is deterministic per track and differs between tracks", () => {
    expect(rhythmFor("T", "A")).toEqual(rhythmFor("T", "A"));
    expect(rhythmFor("T", "A")).not.toEqual(rhythmFor("T2", "A"));
  });

  it("keeps bpm inside the documented range", () => {
    for (const t of TITLES) {
      const { bpm } = rhythmFor(t, "artist");
      expect(bpm).toBeGreaterThanOrEqual(BPM_MIN);
      expect(bpm).toBeLessThan(BPM_MAX);
    }
  });

  it("title/artist boundary matters (no accidental collisions from concatenation)", () => {
    expect(hashString("ab\u0000c")).not.toBe(hashString("a\u0000bc"));
  });
});

describe("beatAt", () => {
  it("stays in [0, 1]", () => {
    for (const t of TITLES) {
      const r = rhythmFor(t, "artist");
      for (let ms = 0; ms < 60_000; ms += 37) {
        const v = beatAt(r, ms / 1000);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is continuous: never jumps more than 0.3 across one ~30fps frame (subtlety cap)", () => {
    for (const t of TITLES) {
      const r = rhythmFor(t, "artist");
      let prev = beatAt(r, 0);
      for (let ms = 33; ms < 60_000; ms += 33) {
        const v = beatAt(r, ms / 1000);
        expect(Math.abs(v - prev)).toBeLessThan(0.3);
        prev = v;
      }
    }
  });

  it("actually moves (not a constant)", () => {
    const r = rhythmFor("Track One", "artist");
    const values = Array.from({ length: 200 }, (_, i) => beatAt(r, i / 20));
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.5);
  });
});

describe("waveformPeaks", () => {
  it("is deterministic, the requested length, and within (0, 1]", () => {
    const a = waveformPeaks("T", "A", 48);
    expect(a).toEqual(waveformPeaks("T", "A", 48));
    expect(a).toHaveLength(48);
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0.12);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(Math.max(...a)).toBeCloseTo(1, 5);
  });

  it("differs between tracks", () => {
    expect(waveformPeaks("T", "A", 48)).not.toEqual(waveformPeaks("T2", "A", 48));
  });
});
