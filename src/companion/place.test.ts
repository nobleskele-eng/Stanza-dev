import { describe, expect, it } from "vitest";
import { edgeLength, noSitRanges, placeAround, placeOnEdge, type Surface } from "./place";
import { SKINS } from "./registry";
import { anchorOf, type AnimationName, type Skin } from "./skin";

describe("companion placement", () => {
  it("fits whole anchor positions on an edge", () => {
    expect(edgeLength(340, 2)).toBe(170);
    expect(edgeLength(340, 2.4)).toBe(141); // 141 × 2.4 = 338.4 ≤ 340
    expect(edgeLength(1, 2)).toBe(1);
  });

  it("rests the anchor pixel on the edge, mirrored for the other facing", () => {
    const skin = SKINS.pilcrow; // anchor (10, 14), sit (10, 10)
    const edge = { left: 100, top: 50, width: 340 };
    expect(placeOnEdge(skin, "idle", 0, 1, 2, edge)).toEqual({ left: 80, top: 20 });
    expect(placeOnEdge(skin, "idle", 0, -1, 2, edge)).toEqual({ left: 90, top: 20 }); // anchor column 15 − 10 = 5
    expect(placeOnEdge(skin, "sit", 0, 1, 2, edge).top).toBe(28); // the seat (row 10) sits on the edge
  });

  it("keeps a sitting creature's legs off blocked stretches, whichever way it faces", () => {
    const skin = SKINS.pilcrow;
    const px = 2;
    const [[from, to]] = noSitRanges(skin, [[100, 140]], px);
    // Check against the art: every frame, both facings, at the range's ends and just outside them.
    const a = anchorOf(skin, "sit");
    const legsCover = (x: number, facing: 1 | -1) =>
      skin.animations.sit.frames.some((f) =>
        f.some((r, y) => y > a.y && [...r].some((c, col) => c !== "." && overlaps((x + (facing > 0 ? col - a.x : a.x - col)) * px, 100, 140, px))),
      );
    const overlaps = (start: number, lo: number, hi: number, w: number) => start < hi && start + w > lo;
    expect(legsCover(from, 1) || legsCover(from, -1)).toBe(true);
    expect(legsCover(to, 1) || legsCover(to, -1)).toBe(true);
    expect(legsCover(from - 1, 1) || legsCover(from - 1, -1)).toBe(false);
    expect(legsCover(to + 1, 1) || legsCover(to + 1, -1)).toBe(false);
  });
});

describe("companion placement around the card (C3a)", () => {
  const px = 2;
  const card = { left: 100, top: 60, width: 248, height: 88 };
  const top = { left: card.left, top: card.top, width: card.width };

  /** Every opaque pixel of every frame, as CSS-px boxes, for a pose placed on the outline. */
  function pixels(skin: Skin, animation: AnimationName, surface: Surface, pos: number, facing: 1 | -1) {
    const at = placeAround(skin, animation, surface, pos, facing, px, top, card);
    const boxes: { left: number; top: number; right: number; bottom: number }[] = [];
    for (const f of skin.animations[animation].frames)
      f.forEach((r, y) => {
        for (let x = 0; x < r.length; x++)
          if (r[x] !== ".") {
            const col = at.mirrored ? skin.grid - 1 - x : x;
            boxes.push({ left: at.left + col * px, top: at.top + y * px, right: at.left + (col + 1) * px, bottom: at.top + (y + 1) * px });
          }
      });
    return boxes;
  }
  const most = (xs: number[]) => Math.max(...xs);
  const least = (xs: number[]) => Math.min(...xs);

  for (const skin of Object.values(SKINS)) {
    it(`${skin.id}: climbing, the art touches the side from outside, and at the top corner it's level with the top`, () => {
      const left = pixels(skin, "climb", "left", 0, 1);
      expect(most(left.map((b) => b.right)), "touches the left side").toBe(card.left);
      expect(least(left.map((b) => b.top)), "level with the card's top").toBe(card.top);
      const right = pixels(skin, "climb", "right", 0, -1); // mirrored on the right, whichever way it climbs
      expect(least(right.map((b) => b.left)), "touches the right side").toBe(card.left + card.width);
      expect(least(right.map((b) => b.top))).toBe(card.top);
      // Lower down it's the same pose, moved by whole art pixels.
      expect(least(pixels(skin, "climb", "left", 10, 1).map((b) => b.top))).toBe(card.top + 10 * px);
    });

    it(`${skin.id}: hanging, the art touches the bottom from below, at the bottom's position from the card's left`, () => {
      for (const facing of [1, -1] as const) {
        const hang = pixels(skin, "hang", "bottom", 30, facing);
        expect(least(hang.map((b) => b.top)), `facing ${facing}`).toBe(card.top + card.height);
      }
      const a = anchorOf(skin, "hang");
      expect(a.x, "the skin anchor's column").toBe(skin.anchor.x);
      const at = placeAround(skin, "hang", "bottom", 30, 1, px, top, card);
      expect(at.left + a.x * px).toBe(card.left + 30 * px);
    });
  }

  it("an animation's own anchor still wins over the defaults", () => {
    const skin: Skin = JSON.parse(JSON.stringify(SKINS.pilcrow));
    skin.animations.climb.anchor = { x: 3, y: 4 };
    expect(anchorOf(skin, "climb")).toEqual({ x: 3, y: 4 });
    expect(placeAround(skin, "climb", "left", 0, 1, px, top, card)).toEqual({ left: card.left - 4 * px, top: card.top - 4 * px, mirrored: false });
  });
});
