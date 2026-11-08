// What a creature wears (PLAN.md §4b, M2 D2b). An accessory is drawn once per species, upright and facing right, and
// every frame of the skin's animations says where it sits (a mount: the head or the neck) and how it's turned there.
// `dress` draws it into every frame, so everything that reads a skin (the renderer, placement, the shelf's trimming,
// the artwork rules) sees the dressed creature with no special cases. Pure.
import { MAX_GRID, animationOf, anchorOf, type Accessory, type Anchor, type Mount, type Skin, type SkinAnimation } from "./skin";

/** An accessory's art turned for a mount (clockwise quarter turns, then a vertical flip), and where its anchor went. */
export function turnArt(art: readonly string[], anchor: Anchor, turn = 0, flip = false): { rows: string[]; anchor: Anchor } {
  let rows = [...art];
  let a = { ...anchor };
  for (let t = 0; t < turn; t += 90) {
    const h = rows.length;
    const w = rows[0].length;
    // Clockwise: the pixel at (x, y) goes to (h − 1 − y, x).
    rows = Array.from({ length: w }, (_, y) => Array.from({ length: h }, (_, x) => rows[h - 1 - x][y]).join(""));
    a = { x: h - 1 - a.y, y: a.x };
  }
  if (flip) {
    rows = [...rows].reverse();
    a = { x: a.x, y: rows.length - 1 - a.y };
  }
  return { rows, anchor: a };
}

/** Every opaque pixel of an accessory at a mount, in the frame's art px: [x, y, slot]. */
export function placed(acc: Accessory, m: Mount): [number, number, string][] {
  const { rows, anchor } = turnArt(acc.art, acc.anchor, m.turn, m.flip);
  const out: [number, number, string][] = [];
  rows.forEach((r, y) => [...r].forEach((c, x) => c !== "." && out.push([m.x - anchor.x + x, m.y - anchor.y + y, c])));
  return out;
}

/**
 * The skin wearing accessory `id`: drawn over every frame its animations rig a mount for, and marked `worn` (its
 * colours, for the renderer). The anchors a skin can leave to its art (`climb`, `hang`) are pinned to the bare
 * creature's, so wearing a hat never moves it. No accessory, or an unknown one: the skin as it is.
 */
export function dress(skin: Skin, id: string | null | undefined): Skin {
  const acc = id ? skin.accessories?.[id] : undefined;
  if (!id || !acc) return skin;
  const animations: Record<string, SkinAnimation> = {};
  for (const [name, anim] of Object.entries(skin.animations) as [keyof Skin["animations"], SkinAnimation][]) {
    const mounts = anim.rig?.[acc.mount];
    const frames = anim.frames.map((f, i) => {
      const m = mounts?.[i];
      if (!m) return f;
      const rows = f.map((r) => [...r]);
      for (const [x, y, c] of placed(acc, m)) if (y >= 0 && y < rows.length && x >= 0 && x < rows[y].length) rows[y][x] = c;
      return rows.map((r) => r.join(""));
    });
    const anchor = anim.anchor ?? (name === "climb" || name === "hang" ? anchorOf(skin, name) : undefined);
    animations[name] = { ...anim, frames, ...(anchor ? { anchor } : {}) };
  }
  return { ...skin, animations: animations as Skin["animations"], worn: { id, colours: acc.colours } };
}

/**
 * Where wearing accessory `id` would break a rule: an accessory pixel off the grid, or (C3c) on the card's side of a
 * corner pose's anchor. Paths like `animations.walk.frames.1`; empty when it fits everywhere.
 */
export function misfits(skin: Skin, id: string): string[] {
  const acc = skin.accessories?.[id];
  if (!acc) return [`accessories.${id}`];
  const out: string[] = [];
  for (const [name, anim] of Object.entries(skin.animations) as [keyof Skin["animations"], SkinAnimation][]) {
    const a = name === "over" || name === "under" ? animationOf(skin, name).anchor : undefined;
    anim.frames.forEach((f, i) => {
      const m = anim.rig?.[acc.mount]?.[i];
      if (!m) return;
      const bad = placed(acc, m).some(
        ([x, y]) =>
          x < 0 || y < 0 || x >= Math.min(skin.grid, MAX_GRID) || y >= f.length || (a !== undefined && x > a.x && (name === "over" ? y > a.y : y < a.y)),
      );
      if (bad) out.push(`animations.${name}.frames.${i}`);
    });
  }
  return out;
}

/** The skin bare, then in each accessory it can wear: every rule about a creature's art must hold for each (D2b). */
export const outfits = (skin: Skin): Skin[] => [skin, ...Object.keys(skin.accessories ?? {}).map((id) => dress(skin, id))];

/** "pilcrow", or "pilcrow + beanie" for a dressed skin: test names and lab labels. */
export const outfitName = (skin: Skin) => (skin.worn ? `${skin.id} + ${skin.worn.id}` : skin.id);
