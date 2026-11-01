import { describe, expect, it } from "vitest";
import { measureOutline, measureShelf, type Box } from "./measure";
import { FLOOR_ANIMATIONS, placeOnEdge, sitDepth } from "./place";
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

describe.each(Object.entries(SKINS))("measureShelf · %s", (_id, skin) => {
  const px = 2;
  const card: Box = { left: 40, top: 100, right: 340, bottom: 400 };
  /** Every floor pose at every position on `shelf`, facing both ways: the opaque pixels as boxes. */
  const drawnOn = (shelf: { left: number; top: number; width: number }) => {
    const out: Box[] = [];
    for (let s = 0; s < Math.floor(shelf.width / px); s++)
      for (const animation of FLOOR_ANIMATIONS)
        for (const facing of [1, -1] as const) {
          const at = placeOnEdge(skin, animation, s, facing, px, shelf);
          for (const f of skin.animations[animation].frames)
            f.forEach((r, y) => {
              for (let x = 0; x < r.length; x++)
                if (r[x] !== ".") {
                  const l = at.left + (facing < 0 ? skin.grid - 1 - x : x) * px;
                  out.push(box(l, at.top + y * px, l + px, at.top + (y + 1) * px));
                }
            });
        }
    return out;
  };
  const overlaps = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  it("keeps a clear shelf whole, with a door on each side it touches", () => {
    expect(measureShelf(skin, card, { left: 40, top: 300, width: 120 }, [], px)).toEqual({ edge: { left: 40, top: 300, width: 120 }, doors: ["left"] });
    expect(measureShelf(skin, card, { left: 220, top: 300, width: 120 }, [], px)).toEqual({ edge: { left: 220, top: 300, width: 120 }, doors: ["right"] });
    expect(measureShelf(skin, card, { left: 40, top: 300, width: 300 }, [], px)?.doors).toEqual(["left", "right"]);
  });

  it("trims the end near a part, so no floor pose anywhere on it covers the part", () => {
    const part = box(140, 280, 200, 300); // beside the shelf's far end, on its line
    const shelf = measureShelf(skin, card, { left: 40, top: 300, width: 160 }, [part], px)!;
    expect(shelf.doors).toEqual(["left"]);
    expect(shelf.edge.left).toBe(40);
    expect(shelf.edge.width).toBeLessThan(160);
    expect(drawnOn(shelf.edge).some((b) => overlaps(b, part)), "a pose covers the part").toBe(false);
    // One more position would.
    expect(drawnOn({ ...shelf.edge, width: shelf.edge.width + px }).some((b) => overlaps(b, part))).toBe(true);
  });

  it("is no shelf without a door: touching no side, or a part at the end that touches one", () => {
    expect(measureShelf(skin, card, { left: 100, top: 300, width: 120 }, [], px)).toBeNull();
    expect(measureShelf(skin, card, { left: 40, top: 300, width: 120 }, [box(40, 280, 70, 300)], px)).toBeNull();
    // A full-width shelf blocked at its left end keeps its right door.
    expect(measureShelf(skin, card, { left: 40, top: 300, width: 300 }, [box(40, 280, 70, 300)], px)?.doors).toEqual(["right"]);
  });
});
