import { describe, expect, it } from "vitest";
import { GEAR, GEAR_COLOUR, gearMenuIcon } from "./gearIcon";

describe("the settings gear", () => {
  it("is a 16 × 16 grid of one colour, the same turned a quarter and mirrored", () => {
    expect(GEAR).toHaveLength(16);
    for (const row of GEAR) expect(row).toMatch(/^[.1]{16}$/);
    const turned = GEAR.map((_, y) => GEAR.map((row) => row[15 - y]).join(""));
    expect(turned).toEqual([...GEAR]);
    expect(GEAR.map((row) => [...row].reverse().join(""))).toEqual([...GEAR]);
    // A hole in the middle.
    expect(GEAR[7].slice(6, 10)).toBe("....");
  });

  it("renders at 16 px up to 199 %, 32 px from 200 %, in its one colour, the rest transparent", () => {
    const one = gearMenuIcon(1);
    expect([one.width, one.height, one.rgba.length]).toEqual([16, 16, 16 * 16 * 4]);
    expect([gearMenuIcon(1.5).width, gearMenuIcon(2).width]).toEqual([16, 32]);
    const opaque = new Set<string>();
    for (let i = 0; i < one.rgba.length; i += 4) {
      const [r, g, b, a] = one.rgba.slice(i, i + 4);
      if (a === 0) expect(r + g + b).toBe(0);
      else opaque.add(`#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`);
    }
    expect([...opaque]).toEqual([GEAR_COLOUR]);
  });
});
