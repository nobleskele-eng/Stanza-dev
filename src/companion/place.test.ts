import { describe, expect, it } from "vitest";
import { advance, createBrain, drop, nextChangeAt, pickUp, pose, type World } from "./brain";
import { spriteBoxPx } from "./pixel";
import { measureShelf } from "./measure";
import { FLOOR_ANIMATIONS, carryPoint, edgeLength, landingFor, noSitRanges, placeAround, placeOnEdge, type Surface } from "./place";
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
  const card = { left: 56, top: 56, width: 248, height: 88 };
  const top = { left: card.left, top: card.top, width: card.width };
  /** Artwork layouts: the lab's square; flush with the card's left side, its full height; across the card's top. */
  const LAYOUTS = {
    lab: { left: 69, top: 69, width: 64, height: 64 },
    "left side": { left: card.left, top: card.top, width: 88, height: card.height },
    "across the top": { left: card.left, top: card.top, width: card.width, height: 60 },
  };

  // The lab's mock card at 100%, and at 125% (3 CSS px per 2.4: art px that don't divide the card's size).
  for (const px of [2, 2.4]) {
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
    type Box = { left: number; top: number; right: number; bottom: number };
    const over = (b: Box, a: typeof card) =>
      b.left < a.left + a.width - EPS && b.right > a.left + EPS && b.top < a.top + a.height - EPS && b.bottom > a.top + EPS;
    const inside = (b: Box, room: typeof card) =>
      b.left >= room.left - EPS && b.right <= room.left + room.width + EPS && b.top >= room.top - EPS && b.bottom <= room.top + room.height + EPS;

    for (const [layout, art] of Object.entries(LAYOUTS))
      for (const skin of Object.values(SKINS)) {
        const box = spriteBoxPx(skin.grid, px);
        // The component's default: the card and a sprite's box around it (the window's margin, C3b).
        const room = { left: card.left - box, top: card.top - box, width: card.width + 2 * box, height: card.height + 2 * box };

        it(`${skin.id} at ${px} px, artwork ${layout}: carried anywhere, never over the artwork; let go, it falls only down and lands`, () => {
          const surfaces = new Set<string>();
          const wrong: string[] = []; // collected, then checked once: tens of thousands of expect() calls are slow
          const count = { falls: 0, faceFalls: 0, turns: 0, overCard: 0 };
          for (const facing of [1, -1] as const)
            for (let wy = room.top - 40; wy <= room.top + room.height + 40; wy += 5)
              for (let wx = room.left - 40; wx <= room.left + room.width + 40; wx += 9) {
                const where = `facing ${facing}, wanted (${wx}, ${wy})`;
                const at = carryPoint(skin, { left: wx, top: wy }, facing < 0, px, card, room, [art]);
                if (!Number.isInteger(at.x) || !Number.isInteger(at.y)) wrong.push(`${where}: not whole art px`);
                for (const name of ["held", "fall"] as const)
                  for (const b of drawn(skin, name, at, facing < 0)) {
                    if (!inside(b, room)) wrong.push(`${where}: ${name} leaves the room`);
                    if (over(b, art)) wrong.push(`${where}: ${name} over the artwork`);
                  }
                if (drawn(skin, "held", at, facing < 0).some((b) => over(b, card))) count.overCard++;
                // Let go there: the brain's whole fall, every step clear of the artwork and never upwards.
                const to = landingFor(skin, at, facing, px, top, card, [art]);
                surfaces.add(to.surface);
                if (to.surface === "bottom" && to.via) count.faceFalls++;
                if ((to.via?.length ?? 0) >= 2) count.turns++;
                let b = drop(pickUp({ ...createBrain(skin, world, 0, 1), facing }, skin, world, 0, at), skin, world, 0, to);
                if (pose(b).animation === "fall") count.falls++;
                for (let guard = 0; pose(b).air && guard < 200; guard++) {
                  const air = pose(b).air!;
                  for (const p of drawn(skin, "fall", air, facing < 0)) {
                    if (over(p, art)) wrong.push(`${where}: falls over the artwork`);
                    if (!inside(p, room)) wrong.push(`${where}: falls out of the room`);
                  }
                  b = advance(b, skin, world, nextChangeAt(b, skin, world)!);
                  const next = pose(b).air;
                  if (next && next.y < air.y - EPS) wrong.push(`${where}: falls upwards`);
                }
                const p = pose(b);
                if (p.air || p.surface !== to.surface || p.x !== to.x) wrong.push(`${where}: didn't land where it was headed`);
                const placed = placeAround(skin, p.animation, to.surface, to.x, to.facing, px, top, card);
                if (Math.abs(placed.left - (card.left + to.at.x * px)) > EPS || Math.abs(placed.top - (card.top + to.at.y * px)) > EPS)
                  wrong.push(`${where}: the landing's box isn't the landed pose's`);
              }
          expect(wrong.slice(0, 10)).toEqual([]);
          expect([...surfaces].sort(), "every surface is somewhere to land").toEqual(["bottom", "left", "right", "top"]);
          expect(count.overCard, "it can be carried over the card").toBeGreaterThan(100);
          expect(count.falls, "some drops are real falls").toBeGreaterThan(20);
          expect(count.faceFalls, "some fall down the card's face").toBeGreaterThan(20);
          // Only the lab's artwork leaves room above it on the card; the others start at the card's top.
          if (layout === "lab") expect(count.turns, "some slide off the artwork").toBeGreaterThan(0);
        }, 30_000);
      }
  }

  const skin = SKINS.pilcrow; // held and fall art: columns 2–14, rows 2–13; anchor column 10; hang's top row 0
  const px = 2;
  const lab = [LAYOUTS.lab]; // art px from the card: 6.5 to 38.5 both ways

  it("from above the top: the nearest surface, falling onto the top; beside or under the card: grabbed at once", () => {
    expect(landingFor(skin, { x: 40, y: -20 }, 1, px, top, card)).toMatchObject({ surface: "top", x: 50, facing: 1, via: [] });
    expect(landingFor(skin, { x: 40, y: -20 }, -1, px, top, card)).toMatchObject({ surface: "top", x: 45, facing: -1, via: [] });
    const grabbed = [
      landingFor(skin, { x: -15, y: 20 }, 1, px, top, card),
      landingFor(skin, { x: 124, y: 20 }, 1, px, top, card),
      landingFor(skin, { x: 40, y: 45 }, 1, px, top, card),
    ];
    expect(grabbed.map((l) => [l.surface, l.facing, l.via])).toEqual([
      ["left", -1, undefined],
      ["right", -1, undefined],
      ["bottom", 1, undefined],
    ]);
    // Beside the card a little lower than its top: the top's end is about as near as the side, but out of reach.
    expect(landingFor(skin, { x: -15, y: -10 }, 1, px, top, card).surface).toBe("left");
    // Clear above the line in the same corner: the top's end (its anchor column, 10 art px in, is past the card's left).
    expect(landingFor(skin, { x: -12, y: -16 }, 1, px, top, card)).toMatchObject({ surface: "top", x: 0 });
  });

  it("over the card: feet near the top catch it; lower, it falls down the face and catches the bottom", () => {
    const caught = landingFor(skin, { x: 40, y: -12 }, 1, px, top, card); // feet 2 art px below the line
    expect(caught).toMatchObject({ surface: "top", x: 50 });
    expect(caught.via, "stepped up onto, not fallen to").toBeUndefined();
    expect(landingFor(skin, { x: 60, y: 10 }, 1, px, top, card)).toEqual({ surface: "bottom", x: 70, facing: 1, at: { x: 60, y: 44 }, via: [] });
    // Near the right end, the bottom's end holds it back: straight down, then along under the card.
    expect(landingFor(skin, { x: 118, y: 10 }, 1, px, top, card)).toMatchObject({ surface: "bottom", x: 123, at: { x: 113, y: 44 }, via: [{ x: 118, y: 44 }] });
  });

  it("the artwork in the way stops the fall: it slides off the nearer side and falls on, or grabs the card's side", () => {
    // Over the artwork's left part: down onto it, off its left edge, then down to the bottom.
    expect(landingFor(skin, { x: 10, y: -10 }, 1, px, top, card, lab)).toEqual({
      surface: "bottom",
      x: 1,
      facing: 1,
      at: { x: -9, y: 44 },
      via: [
        { x: 10, y: -8 },
        { x: -9, y: -8 },
      ],
    });
    // Artwork flush with the card's left side: sliding off its left edge leaves the card, so it grabs that side.
    const flush = [{ left: card.left, top: 70, width: 60, height: 60 }]; // art px 0–30 across, from 7 down
    expect(landingFor(skin, { x: 5, y: -8 }, 1, px, top, card, flush)).toMatchObject({
      surface: "left",
      facing: -1,
      via: [
        { x: 5, y: -7 },
        { x: -15, y: -7 },
      ],
    });
  });

  it("without an outline (the top only, or reduced motion) it always lands on the top, at the nearest end", () => {
    expect(landingFor(skin, { x: -15, y: 20 }, 1, px, top, null)).toMatchObject({ surface: "top", x: 0 });
    expect(landingFor(skin, { x: 200, y: 50 }, 1, px, top, null)).toMatchObject({ surface: "top", x: 123 });
  });

  it("carried over the card it goes where it's wanted; over the artwork, it's pushed out the nearest way", () => {
    const box = spriteBoxPx(skin.grid, px);
    const room = { left: card.left - box, top: card.top - box, width: card.width + 2 * box, height: card.height + 2 * box };
    expect(carryPoint(skin, { left: card.left + 200, top: card.top + 40 }, false, px, card, room, lab)).toEqual({ x: 100, y: 20 });
    // Over the artwork's right part: out past its right edge (7 art px), not over its top (9).
    expect(carryPoint(skin, { left: card.left + 60, top: card.top + 2 }, false, px, card, room, lab)).toEqual({ x: 37, y: 1 });
    // Above the card, in the room: where it was wanted, in whole art px.
    expect(carryPoint(skin, { left: card.left + 61, top: card.top - 32 }, false, px, card, room, lab)).toEqual({ x: 31, y: -16 });
  });
});

describe("companion placement with a shelf (C5a)", () => {
  // The lab's shelf card at 100%: 248 × 152 CSS px, the mock artwork, and the shelf trimmed beside the mock badge.
  const card = { left: 56, top: 56, width: 248, height: 152 };
  const top = { left: card.left, top: card.top, width: card.width };
  const art = { left: 69, top: 69, width: 64, height: 64 };
  const badge = { left: 160, top: 172, right: 200, bottom: 192 };
  const line = { left: card.left, top: 192, width: 112 };
  const toBox = (b: typeof art) => ({ left: b.left, top: b.top, right: b.left + b.width, bottom: b.top + b.height });

  for (const px of [2, 2.4])
    for (const skin of Object.values(SKINS)) {
      it(`${skin.id} at ${px} px: dropped anywhere over the card, some land on the shelf; every fall stays off the artwork`, () => {
        const shelf = measureShelf(skin, toBox(card), line, [toBox(art), badge], px)!;
        expect(shelf, "the lab's shelf fits every skin").not.toBeNull();
        const at = Math.round((shelf.edge.top - card.top) / px) - 1;
        const world: World = {
          playing: true,
          reducedMotion: false,
          edge: { length: edgeLength(card.width, px), noSit: [] },
          around: { side: edgeLength(card.height, px), bottom: edgeLength(card.width, px) },
          shelf: { length: edgeLength(shelf.edge.width, px), left: 0, doors: shelf.doors, at },
        };
        const box = spriteBoxPx(skin.grid, px);
        const room = { left: card.left - box, top: card.top - box, width: card.width + 2 * box, height: card.height + 2 * box };
        const EPS = 1e-6;
        const wrong: string[] = [];
        let onShelf = 0;
        for (const facing of [1, -1] as const)
          for (let wy = card.top; wy <= card.top + card.height; wy += 6)
            for (let wx = card.left - 10; wx <= card.left + card.width; wx += 7) {
              const where = `facing ${facing}, wanted (${wx}, ${wy})`;
              const from = carryPoint(skin, { left: wx, top: wy }, facing < 0, px, card, room, [art]);
              const to = landingFor(skin, from, facing, px, top, card, [art], shelf.edge);
              let b = drop(pickUp({ ...createBrain(skin, world, 0, 1), facing }, skin, world, 0, from), skin, world, 0, to);
              for (let guard = 0; pose(b).air && guard < 200; guard++) {
                const air = pose(b).air!;
                const o = { x0: card.left + air.x * px, y0: card.top + air.y * px };
                for (const f of skin.animations.fall.frames)
                  f.forEach((r, y) => {
                    for (let x = 0; x < r.length; x++) {
                      if (r[x] === ".") continue;
                      const l = o.x0 + (facing < 0 ? skin.grid - 1 - x : x) * px;
                      const t = o.y0 + y * px;
                      if (l < art.left + art.width - EPS && l + px > art.left + EPS && t < art.top + art.height - EPS && t + px > art.top + EPS)
                        wrong.push(`${where}: falls over the artwork`);
                    }
                  });
                b = advance(b, skin, world, nextChangeAt(b, skin, world)!);
                const next = pose(b).air;
                if (next && next.y < air.y - EPS) wrong.push(`${where}: falls upwards`);
              }
              const p = pose(b);
              if (p.air || p.surface !== to.surface || p.x !== to.x) wrong.push(`${where}: didn't land where it was headed`);
              if (to.surface !== "shelf") continue;
              onShelf++;
              const placed = placeAround(skin, "land", "shelf", to.x, to.facing, px, top, card, shelf.edge);
              if (Math.abs(placed.left - (card.left + to.at.x * px)) > EPS || Math.abs(placed.top - (card.top + to.at.y * px)) > EPS)
                wrong.push(`${where}: the landing's box isn't the landed pose's`);
            }
        expect(wrong.slice(0, 10)).toEqual([]);
        expect(onShelf, "some drops land on the shelf").toBeGreaterThan(20);
      }, 30_000);
    }

  const skin = SKINS.pilcrow; // held and fall art: rows 2–13, so its feet are 14 art px below its box's top
  const px = 2;
  const shelf = measureShelf(skin, toBox(card), line, [toBox(art), badge], px)!;
  const LINE = (shelf.edge.top - card.top) / px; // 68 art px down
  const n = edgeLength(shelf.edge.width, px);

  it("places a pose on the shelf as on an edge of its own", () => {
    for (const animation of FLOOR_ANIMATIONS)
      for (const facing of [1, -1] as const)
        expect(placeAround(skin, animation, "shelf", 7, facing, px, top, card, shelf.edge)).toEqual({
          ...placeOnEdge(skin, animation, 7, facing, px, shelf.edge),
          mirrored: facing < 0,
        });
  });

  it("over the shelf it falls onto it; feet a little below its line step up onto it; lower, it falls past", () => {
    const fallen = landingFor(skin, { x: 10, y: 40 }, 1, px, top, card, [], shelf.edge);
    expect(fallen.surface).toBe("shelf");
    expect(fallen.via, "fallen to").toBeDefined();
    expect(fallen.at.y + anchorOf(skin, "land").y + 1, "its anchor on the line").toBe(LINE);
    const stepped = landingFor(skin, { x: 10, y: LINE - 14 + 2 }, 1, px, top, card, [], shelf.edge);
    expect(stepped.surface).toBe("shelf");
    expect(stepped.via, "stepped up onto, not fallen to").toBeUndefined();
    expect(landingFor(skin, { x: 10, y: LINE - 14 + 4 }, 1, px, top, card, [], shelf.edge).surface).toBe("bottom");
  });

  it("past the shelf's end it falls on to the bottom; off the artwork's left side it lands on the shelf", () => {
    const past = landingFor(skin, { x: n + 2, y: 40 }, 1, px, top, card, [art], shelf.edge);
    expect(past.surface).toBe("bottom");
    const slid = landingFor(skin, { x: 10, y: -10 }, 1, px, top, card, [art], shelf.edge);
    expect(slid.surface).toBe("shelf");
    expect(slid.via!.length, "onto the artwork, off its side, down to the shelf").toBeGreaterThanOrEqual(2);
  });

  it("without a shelf, or without the outline, nothing changes", () => {
    for (const air of [{ x: 10, y: 40 }, { x: 10, y: -10 }, { x: 60, y: 10 }])
      expect(landingFor(skin, air, 1, px, top, card, [art], null)).toEqual(landingFor(skin, air, 1, px, top, card, [art]));
    expect(landingFor(skin, { x: 10, y: 40 }, 1, px, top, null, [], shelf.edge).surface).toBe("top");
  });
});
