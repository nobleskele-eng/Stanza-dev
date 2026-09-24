import { describe, expect, it } from "vitest";
import { DEBRIS_FADE_AT_MS, DEBRIS_MS, MAX_DEBRIS, glyphChars, layoutDebris } from "./debrisLayout";

const mono = (w: number) => () => w;

describe("layoutDebris", () => {
  it("makes one glyph per visible character, in order, and never invents any", () => {
    const g = layoutDebris("Blue Monday", mono(10), 0, 200);
    expect(glyphChars(g)).toBe("BlueMonday");
    for (const glyph of g) expect("Blue Monday").toContain(glyph.ch);
  });

  it("whitespace advances the row but is never a body", () => {
    const g = layoutDebris("a b", mono(10), 0, 30); // row = 30px, centred exactly
    expect(g.map((x) => x.ch)).toEqual(["a", "b"]);
    expect(g[0].x).toBe(0);
    expect(g[1].x).toBe(20); // the space took the 10..20 slot
  });

  it("centres the row in the box", () => {
    const g = layoutDebris("ab", mono(10), 100, 100); // row 20px in a 100px box starting at 100
    expect(g[0].x).toBe(140);
    expect(g[1].x).toBe(150);
  });

  it("caps the number of bodies", () => {
    const long = "x".repeat(200);
    expect(layoutDebris(long, mono(5), 0, 100)).toHaveLength(MAX_DEBRIS);
    expect(layoutDebris("abcdefghij", mono(5), 0, 100, 4)).toHaveLength(4);
    // spaces don't eat into the cap
    expect(glyphChars(layoutDebris("a b c d", mono(5), 0, 100, 3))).toBe("abc");
  });

  it("handles CJK and combining characters as single glyphs, and an empty title", () => {
    expect(glyphChars(layoutDebris("夜に駆ける", mono(12), 0, 100))).toBe("夜に駆ける");
    expect(layoutDebris("é", mono(8), 0, 20).length).toBe(1);
    expect(layoutDebris("", mono(8), 0, 100)).toEqual([]);
    expect(layoutDebris("   ", mono(8), 0, 100)).toEqual([]);
  });

  it("uses the measured width of each glyph", () => {
    const g = layoutDebris("iW", (ch) => (ch === "i" ? 4 : 16), 0, 20);
    expect(g[0]).toMatchObject({ ch: "i", x: 0, w: 4 });
    expect(g[1]).toMatchObject({ ch: "W", x: 4, w: 16 });
  });

  it("the timeline constants are consistent", () => {
    expect(DEBRIS_FADE_AT_MS).toBeLessThan(DEBRIS_MS);
    expect(MAX_DEBRIS).toBeLessThanOrEqual(40);
  });
});
