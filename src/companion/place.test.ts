import { describe, expect, it } from "vitest";
import { advance, createBrain, drop, nextChangeAt, pickUp, pose, type World } from "./brain";
import { spriteBoxPx } from "./pixel";
import { carryPoint, edgeLength, landingFor, noSitRanges, placeAround, placeOnEdge, type Surface } from "./place";
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

describe("companion placement in the pointer's hand (C4a)", () => {
  // The lab's mock card at 100%, and at 125% (3 CSS px per 2.4: art px that don't divide the card's size).
  for (const px of [2, 2.4]) {
    const card = { left: 56, top: 56, width: 248, height: 88 };
    const top = { left: card.left, top: card.top, width: card.width };
    const world: World = {
      playing: true,
      reducedMotion: false,
      edge: { length: edgeLength(card.width, px), noSit: [] },
      around: { side: edgeLength(card.height, px), bottom: edgeLength(card.width, px) },
    };

    /** An animation's opaque pixels (every frame) as CSS-px boxes, for a sprite box at `at` (art px from the card). */
    const drawn = (skin: Skin, animation: AnimationName, at: { x: number; y: number }, mirrored: boolean) => {
      const boxes: { left: number; top: number; right: number; bottom: number }[] = [];
      for (const f of skin.animations[animation].frames)
        f.forEach((r, y) => {
          for (let x = 0; x < r.length; x++)
            if (r[x] !== ".") {
              const left = card.left + (at.x + (mirrored ? skin.grid - 1 - x : x)) * px;
              const t = card.top + (at.y + y) * px;
              boxes.push({ left, top: t, right: left + px, bottom: t + px });
            }
        });
      return boxes;
    };
    const EPS = 1e-6;
    const offCard = (b: { left: number; top: number; right: number; bottom: number }) =>
      b.right <= card.left + EPS || b.left >= card.left + card.width - EPS || b.bottom <= card.top + EPS || b.top >= card.top + card.height - EPS;
    const inside = (b: { left: number; top: number; right: number; bottom: number }, room: typeof card) =>
      b.left >= room.left - EPS && b.right <= room.left + room.width + EPS && b.top >= room.top - EPS && b.bottom <= room.top + room.height + EPS;

    for (const skin of Object.values(SKINS)) {
      const box = spriteBoxPx(skin.grid, px);
      // The component's default: a sprite's box around the card (the window's margin, C3b).
      const room = { left: card.left - box, top: card.top - box, width: card.width + 2 * box, height: card.height + 2 * box };

      it(`${skin.id} at ${px} px: carried anywhere, it stays in its room and off the card, and every fall stays off it too`, () => {
        const surfaces = new Set<string>();
        const wrong: string[] = []; // collected, then checked once: a few thousand expect() calls are slow
        let falls = 0;
        for (const facing of [1, -1] as const)
          for (let wy = room.top - 40; wy <= room.top + room.height + 40; wy += 5)
            for (let wx = room.left - 40; wx <= room.left + room.width + 40; wx += 9) {
              const where = `facing ${facing}, wanted (${wx}, ${wy})`;
              const at = carryPoint(skin, { left: wx, top: wy }, facing < 0, px, card, room);
              if (!Number.isInteger(at.x) || !Number.isInteger(at.y)) wrong.push(`${where}: not whole art px`);
              for (const name of ["held", "fall"] as const)
                for (const b of drawn(skin, name, at, facing < 0)) {
                  if (!inside(b, room)) wrong.push(`${where}: ${name} leaves the room`);
                  if (!offCard(b)) wrong.push(`${where}: ${name} over the card`);
                }
              // Let go there: the brain's whole fall, every step off the card, then on a surface.
              const to = landingFor(skin, at, facing, px, top, card);
              surfaces.add(to.surface);
              let b = drop(pickUp({ ...createBrain(skin, world, 0, 1), facing }, skin, world, 0, at), skin, world, 0, to);
              if (pose(b).animation === "fall") falls++;
              for (let guard = 0; pose(b).air && guard < 100; guard++) {
                if (drawn(skin, "fall", pose(b).air!, facing < 0).some((p) => !offCard(p))) wrong.push(`${where}: falls over the card`);
                b = advance(b, skin, world, nextChangeAt(b, skin, world)!);
              }
              const p = pose(b);
              if (p.air || p.surface !== to.surface || p.x !== to.x) wrong.push(`${where}: didn't land where it was headed`);
              const placed = placeAround(skin, p.animation, to.surface, to.x, to.facing, px, top, card);
              if (Math.abs(placed.left - (card.left + to.at.x * px)) > EPS || Math.abs(placed.top - (card.top + to.at.y * px)) > EPS)
                wrong.push(`${where}: the landing's box isn't the landed pose's`);
            }
        expect(wrong.slice(0, 10)).toEqual([]);
        expect([...surfaces].sort(), "every surface is somewhere to land").toEqual(["bottom", "left", "right", "top"]);
        expect(falls, "some drops are real falls").toBeGreaterThan(20);
      }, 30_000);
    }
  }

  const skin = SKINS.pilcrow;
  const px = 2;
  const card = { left: 56, top: 56, width: 248, height: 88 };
  const top = { left: card.left, top: card.top, width: card.width };

  it("lands on the nearest surface: the top from above, a side from beside it, the bottom from below", () => {
    // Above the middle: on the top, its anchor column where it was (pilcrow's anchor column is 10).
    expect(landingFor(skin, { x: 40, y: -20 }, 1, px, top, card)).toMatchObject({ surface: "top", x: 50, facing: 1 });
    expect(landingFor(skin, { x: 40, y: -20 }, -1, px, top, card)).toMatchObject({ surface: "top", x: 45, facing: -1 });
    // Beside the left side, halfway down: it climbs back up from there.
    expect(landingFor(skin, { x: -15, y: 20 }, 1, px, top, card)).toMatchObject({ surface: "left", facing: -1 });
    expect(landingFor(skin, { x: 124, y: 20 }, 1, px, top, card)).toMatchObject({ surface: "right", facing: -1 });
    expect(landingFor(skin, { x: 40, y: 45 }, 1, px, top, card)).toMatchObject({ surface: "bottom", x: 50, facing: 1 });
  });

  it("beside the card but lower than its top, it doesn't fall onto the top (the fall would cross the card's corner)", () => {
    // Just left of the card, a little below its top: the top's end is about as near as the side, but out of reach.
    expect(landingFor(skin, { x: -15, y: -10 }, 1, px, top, card).surface).toBe("left");
    // Clear above the line, in the same corner: the top's end (its anchor column, 10 art px in, is past the card's left).
    expect(landingFor(skin, { x: -12, y: -16 }, 1, px, top, card)).toMatchObject({ surface: "top", x: 0 });
  });

  it("without an outline (the top only, or reduced motion) it always lands on the top, at the nearest end", () => {
    expect(landingFor(skin, { x: -15, y: 20 }, 1, px, top, null)).toMatchObject({ surface: "top", x: 0 });
    expect(landingFor(skin, { x: 200, y: 50 }, 1, px, top, null)).toMatchObject({ surface: "top", x: 123 });
  });

  it("over the card, it's pushed out the nearest way that stays in the room", () => {
    const box = spriteBoxPx(skin.grid, px);
    const room = { left: card.left - box, top: card.top - box, width: card.width + 2 * box, height: card.height + 2 * box };
    // Near the card's top-left corner, inside it: out over the top (the shortest way).
    const near = carryPoint(skin, { left: card.left + 60, top: card.top + 2 }, false, px, card, room);
    expect(near.x).toBe(30);
    expect(near.y + 13 + 1, "pilcrow's lowest held/fall row (13) ends at the top's line").toBe(0);
    // Near the bottom: out under it.
    const low = carryPoint(skin, { left: card.left + 60, top: card.top + 80 }, false, px, card, room);
    expect(low.y + 2).toBe(44); // its top row (2) starts at the card's bottom (88 / 2 = 44)
    // Already off the card and in the room: where it was wanted, in whole art px.
    expect(carryPoint(skin, { left: card.left + 61, top: card.top - 32 }, false, px, card, room)).toEqual({ x: 31, y: -16 });
  });
});
