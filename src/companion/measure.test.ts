import { describe, expect, it } from "vitest";
import { measureOutline, type Box } from "./measure";
import { sitDepth } from "./place";
import { SKINS } from "./registry";

const card: Box = { left: 40, top: 100, right: 340, bottom: 500 };
const box = (left: number, top: number, right: number, bottom: number): Box => ({ left, top, right, bottom });

describe.each(Object.entries(SKINS))("measureOutline · %s", (_id, skin) => {
  const px = 2;
  const depth = sitDepth(skin, px);

  it("gives the card's whole box as the outline, and its whole top as the edge (the margins leave the corners room)", () => {
    const { outline, edge, blocked } = measureOutline(skin, card, [], px);
    expect(outline).toEqual({ left: 40, top: 100, width: 300, height: 400 });
    expect(edge).toEqual({ left: 40, top: 100, width: 300 });
    expect(blocked).toEqual([]);
  });

  it("blocks a part that reaches up into the legs, and only that stretch (relative to the edge's start)", () => {
    const { edge, blocked } = measureOutline(skin, card, [box(100, 100 + depth - 1, 200, 160)], px);
    expect(blocked).toEqual([[100 - edge.left, 200 - edge.left]]);
  });

  it("ignores parts clear of the legs, and parts above the card", () => {
    const { blocked } = measureOutline(skin, card, [box(100, 100 + depth + 1, 200, 160), box(100, 60, 200, 100)], px);
    expect(blocked).toEqual([]);
  });

  it("merges overlapping and touching stretches into one, whatever order they come in", () => {
    const parts = [box(200, 100, 260, 120), box(100, 100, 200, 120), box(120, 100, 150, 120)];
    expect(measureOutline(skin, card, parts, px).blocked).toHaveLength(1);
  });

  it("gives a collapsed card a one-pixel outline rather than an empty one", () => {
    const { outline, edge } = measureOutline(skin, box(10, 10, 10, 10), [], px);
    expect(outline).toMatchObject({ width: px, height: px });
    expect(edge.width).toBe(px);
  });
});
