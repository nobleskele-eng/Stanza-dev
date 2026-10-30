import { describe, expect, it } from "vitest";
import { SKINS } from "../companion/registry";
import { companionMenuIcon, frameToRgba, menuIconScale } from "./companionIcon";

const px = (icon: { rgba: number[]; width: number }, x: number, y: number) => icon.rgba.slice((y * icon.width + x) * 4, (y * icon.width + x) * 4 + 4);

describe("frameToRgba", () => {
  it("maps slots to their palette colour, opaque, and '.' to fully transparent", () => {
    const icon = frameToRgba([".1", "2."], ["#ff0000", "#0a0"], 1);
    expect(icon).toMatchObject({ width: 2, height: 2 });
    expect(px(icon, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(px(icon, 1, 0)).toEqual([255, 0, 0, 255]);
    expect(px(icon, 0, 1)).toEqual([0, 170, 0, 255]);
  });

  it("scales by whole device pixels: each art pixel becomes an s×s block", () => {
    const icon = frameToRgba(["1."], ["#123456"], 2);
    expect(icon).toMatchObject({ width: 4, height: 2 });
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) expect(px(icon, x, y)).toEqual([0x12, 0x34, 0x56, 255]);
    expect(px(icon, 2, 1)).toEqual([0, 0, 0, 0]);
    expect(icon.rgba).toHaveLength(4 * 2 * 4);
  });
});

describe("companionMenuIcon", () => {
  const cassette = SKINS.cassette;

  it("is the cassette's grid at 1:1 up to 199%, and 2:1 at 200%", () => {
    expect(menuIconScale(1)).toBe(1);
    expect(menuIconScale(1.25)).toBe(1);
    expect(menuIconScale(1.5)).toBe(1);
    expect(menuIconScale(2)).toBe(2);
    expect(menuIconScale(NaN)).toBe(1);
    expect(companionMenuIcon(true, 1)).toMatchObject({ width: cassette.grid, height: cassette.grid });
    expect(companionMenuIcon(true, 2)).toMatchObject({ width: cassette.grid * 2, height: cassette.grid * 2 });
  });

  it("on = the idle frame, off = the sleep frame, so the two differ", () => {
    const on = companionMenuIcon(true, 1);
    const off = companionMenuIcon(false, 1);
    expect(on).toEqual(frameToRgba(cassette.animations.idle.frames[0], cassette.palettes.default, 1));
    expect(off).toEqual(frameToRgba(cassette.animations.sleep.frames[0], cassette.palettes.default, 1));
    expect(on.rgba).not.toEqual(off.rgba);
  });

  it("every value is a byte, and the art is neither empty nor solid", () => {
    for (const on of [true, false]) {
      const { rgba } = companionMenuIcon(on, 1);
      expect(rgba.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)).toBe(true);
      const alphas = rgba.filter((_, i) => i % 4 === 3);
      expect(alphas).toContain(0);
      expect(alphas).toContain(255);
    }
  });
});
