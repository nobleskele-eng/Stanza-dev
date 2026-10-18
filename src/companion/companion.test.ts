import { describe, expect, it } from "vitest";
import copyMarkdown from "../../docs/COPY.md?raw";
import { NEEDS_COPY, parseCopy } from "../copy";
import { LAYOUT_GRID, artPixelPx, spriteBoxPx, spriteSizePx } from "./pixel";
import { SKINS } from "./registry";
import { MAX_FPS, MAX_STEP, REQUIRED_ANIMATIONS, validateSkin, type Skin } from "./skin";
import { frameToPaths } from "./spritePaths";

describe("artPixelPx", () => {
  it("is a whole number of device pixels at every scaling", () => {
    for (const [dpr, device] of [
      [1, 2],
      [1.25, 3],
      [1.5, 3],
      [1.75, 4],
      [2, 4],
      [3, 6],
    ] as const) {
      expect(artPixelPx(dpr) * dpr, `dpr ${dpr}`).toBeCloseTo(device, 10);
    }
    expect(spriteSizePx(16, 1)).toBe(32);
  });

  it("treats a missing or nonsense ratio as 100%", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(artPixelPx(bad)).toBe(2);
  });

  it("boxes the art on the layout grid: exact in 1/64 px units, whole device px at every quarter step", () => {
    for (const dpr of [1, 1.25, 1.5, 1.75, 2]) {
      for (const grid of [8, 16, 24, 32]) {
        const box = spriteBoxPx(grid, artPixelPx(dpr));
        expect(box % LAYOUT_GRID, `dpr ${dpr}, grid ${grid}`).toBe(0);
        expect(box * 64, `dpr ${dpr}, grid ${grid}`).toBe(Math.round(box * 64));
        expect(box * dpr, `dpr ${dpr}, grid ${grid}`).toBe(Math.round(box * dpr));
        expect(box).toBeGreaterThanOrEqual(spriteSizePx(grid, dpr));
        expect(box - spriteSizePx(grid, dpr)).toBeLessThan(LAYOUT_GRID);
      }
    }
    expect(spriteBoxPx(16, artPixelPx(1.25))).toBe(40); // 38.4 px of art, 2 device px spare
    expect(spriteBoxPx(16, 2)).toBe(32); // an exact fit stays exact (no float creep upwards)
    expect(spriteBoxPx(16, 8)).toBe(128);
  });
});

/** Rasterises frameToPaths' rectangles back to rows, to prove they cover exactly the frame's pixels. */
function rasterise(paths: ReturnType<typeof frameToPaths>, width: number, height: number): string[] {
  const grid = Array.from({ length: height }, () => Array(width).fill("."));
  for (const { slot, d } of paths)
    for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) for (let i = 0; i < Number(w); i++) grid[Number(y)][Number(x) + i] = String(slot);
  return grid.map((row) => row.join(""));
}

describe("frameToPaths", () => {
  it("merges runs into one path per slot, slots in order", () => {
    expect(frameToPaths([".11.", "2222", "...."])).toEqual([
      { slot: 1, d: "M1 0h2v1h-2z" },
      { slot: 2, d: "M0 1h4v1h-4z" },
    ]);
    expect(frameToPaths(["....", "...."])).toEqual([]);
  });

  it("covers exactly the frame's pixels, for every frame of every bundled skin", () => {
    for (const skin of Object.values(SKINS))
      for (const name of REQUIRED_ANIMATIONS)
        for (const frame of skin.animations[name].frames) expect(rasterise(frameToPaths(frame), skin.grid, skin.grid)).toEqual(frame);
  });
});

const dummy = SKINS["test-dummy"];
const clone = (): Record<string, unknown> => JSON.parse(JSON.stringify(dummy));
const codes = (raw: unknown) => validateSkin(raw).issues.map((i) => `${i.code}@${i.path}`);

describe("validateSkin", () => {
  it("bundles exactly the skins in companions/ (the lab e2e reads that folder)", () => {
    const folders = Object.keys(import.meta.glob("../../companions/*/companion.json")).map((p) => p.split("/").slice(-2)[0]);
    expect(Object.keys(SKINS).sort()).toEqual(folders.sort());
  });

  it("accepts every bundled skin, keyed by its id, named from COPY.md", () => {
    const copy = parseCopy(copyMarkdown);
    for (const [id, skin] of Object.entries(SKINS)) {
      expect(validateSkin(skin).issues, id).toEqual([]);
      expect(skin.id).toBe(id);
      expect(skin.name, id).toBe(copy.get(`Companion skin name — ${id}`) ?? NEEDS_COPY);
    }
  });

  it("rejects the wrong shape, unknown and missing keys, and another format", () => {
    expect(codes(null)).toEqual(["not-an-object@"]);
    expect(codes([])).toEqual(["not-an-object@"]);
    const s = clone();
    s.extra = 1;
    delete s.anchor;
    s.format = 1; // the previous format
    expect(codes(s)).toEqual(expect.arrayContaining(["unknown-key@extra", "missing@anchor", "format-mismatch@format"]));
  });

  it("checks id, name, grid and anchor", () => {
    const s = clone();
    s.id = "Has Spaces";
    s.name = "  ";
    s.anchor = { x: 16, y: 0 };
    expect(codes(s)).toEqual(expect.arrayContaining(["id-invalid@id", "name-invalid@name", "anchor-invalid@anchor"]));
    const g = clone();
    g.grid = 64;
    expect(codes(g)).toContain("grid-invalid@grid");
  });

  it("checks palettes: hex colours only, at most 8, equal lengths, and a default", () => {
    const s = clone();
    s.palettes = { night: ["#000000", "red", "#ffffff"] };
    expect(codes(s)).toEqual(expect.arrayContaining(["default-palette-missing@palettes", "palette-invalid@palettes.night"]));
    const m = clone();
    m.palettes = { default: ["#000000", "#111111", "#222222"], two: ["#000000", "#111111"] };
    expect(codes(m)).toContain("palette-length-mismatch@palettes");
    const big = clone();
    big.palettes = { default: Array(9).fill("#000000") };
    expect(codes(big)).toContain("palette-invalid@palettes.default");
  });

  it("requires every animation and checks fps, loop, frames, durations, steps and anchors", () => {
    const s = clone() as { animations: Record<string, Record<string, unknown>> };
    delete s.animations.sleep;
    s.animations.dance = { fps: 1, loop: true, frames: [] };
    s.animations.walk.fps = MAX_FPS + 1;
    s.animations.idle.loop = "yes";
    s.animations.idle.durations = [10, 160];
    s.animations.sit.frames = [];
    s.animations.climb.steps = [MAX_STEP + 1, 0];
    s.animations.hang.steps = [1];
    s.animations.wake.anchor = { x: 99, y: 0 };
    expect(codes(s)).toEqual(
      expect.arrayContaining([
        "missing@animations.sleep",
        "unknown-key@animations.dance",
        "fps-invalid@animations.walk.fps",
        "loop-invalid@animations.idle.loop",
        "durations-invalid@animations.idle.durations",
        "frames-invalid@animations.sit.frames",
        "steps-invalid@animations.climb.steps",
        "steps-invalid@animations.hang.steps",
        "anchor-invalid@animations.wake.anchor",
      ]),
    );
  });

  it("checks every frame: rows, row length, characters and palette slots", () => {
    const s = clone() as unknown as Skin;
    const frame = (s.animations.walk.frames[0] = [...s.animations.walk.frames[0]]);
    frame[3] = frame[3].slice(1); // one short row
    frame[4] = "x" + frame[4].slice(1); // a bad character
    frame[5] = "9" + frame[5].slice(1); // not a slot at all
    frame[6] = "4" + frame[6].slice(1); // a slot the 3-colour palettes don't have
    s.animations.walk.frames[1] = s.animations.walk.frames[1].slice(1); // a frame missing a row
    expect(codes(s)).toEqual(
      expect.arrayContaining([
        "row-length@animations.walk.frames.0.3",
        "pixel-invalid@animations.walk.frames.0.4.0",
        "pixel-invalid@animations.walk.frames.0.5.0",
        "slot-out-of-range@animations.walk.frames.0.6.0",
        "rows-invalid@animations.walk.frames.1",
      ]),
    );
  });

  it("rejects a skin with any issue as a whole (it must render every state)", () => {
    const s = clone() as { animations: Record<string, Record<string, unknown>> };
    s.animations.walk.fps = 0;
    expect(validateSkin(s).skin).toBeNull();
    expect(validateSkin(dummy).skin).toBe(dummy);
  });
});
