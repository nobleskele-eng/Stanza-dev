import { describe, expect, it } from "vitest";
import { edgeLength, noSitRanges, placeOnEdge } from "./place";
import { SKINS } from "./registry";
import { anchorOf } from "./skin";

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
