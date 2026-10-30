import { describe, expect, it } from "vitest";
import { measureTopEdge, type Box } from "./measure";
import { edgeInset, sitDepth } from "./place";
import { SKINS } from "./registry";

const card: Box = { left: 40, top: 100, right: 340, bottom: 500 };
const box = (left: number, top: number, right: number, bottom: number): Box => ({ left, top, right, bottom });

describe.each(Object.entries(SKINS))("measureTopEdge · %s", (_id, skin) => {
  const px = 2;
  const inset = edgeInset(skin, px);
  const depth = sitDepth(skin, px);

  it("shortens the card's top by the sprite's reach at both ends, on the card's top line", () => {
    const { edge, blocked } = measureTopEdge(skin, card, [], px);
    expect(edge).toEqual({ left: card.left + inset, top: card.top, width: 300 - 2 * inset });
    expect(blocked).toEqual([]);
    expect(inset).toBeGreaterThan(0);
  });

  it("blocks a part that reaches up into the legs, and only that stretch (relative to the edge's start)", () => {
    const { edge, blocked } = measureTopEdge(skin, card, [box(100, 100 + depth - 1, 200, 160)], px);
    expect(blocked).toEqual([[100 - edge.left, 200 - edge.left]]);
  });

  it("ignores parts clear of the legs, and parts above the card", () => {
    const { blocked } = measureTopEdge(skin, card, [box(100, 100 + depth + 1, 200, 160), box(100, 60, 200, 100)], px);
    expect(blocked).toEqual([]);
  });

  it("merges overlapping and touching stretches into one, whatever order they come in", () => {
    const parts = [box(200, 100, 260, 120), box(100, 100, 200, 120), box(120, 100, 150, 120)];
    expect(measureTopEdge(skin, card, parts, px).blocked).toHaveLength(1);
  });

  it("gives a card narrower than the sprite's reach a one-pixel edge rather than a negative one", () => {
    const { edge } = measureTopEdge(skin, box(0, 0, inset, 50), [], px);
    expect(edge.width).toBe(px);
  });
});
