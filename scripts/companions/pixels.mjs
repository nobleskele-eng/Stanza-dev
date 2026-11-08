// Helpers for drawing companion skins as text grids (docs/COMPANION.md). A sprite is a list of equal-length
// strings: "." is transparent, "1"–"8" a palette slot. Frames are always N×N. Out-of-bounds placement throws, so a
// clipped limb is a build error, not a silent bug.
import { writeFileSync } from "node:fs";

export const N = 16;

/** A sprite from rows drawn with "." (or spaces) for transparent pixels. */
export function art(rows) {
  const out = rows.map((r) => r.replace(/ /g, "."));
  const w = out[0].length;
  for (const r of out) {
    if (r.length !== w) throw new Error(`ragged sprite row "${r}" (want ${w}): ${JSON.stringify(out)}`);
    if (!/^[.1-8]*$/.test(r)) throw new Error(`bad pixel in "${r}"`);
  }
  return out;
}

export const blank = (w = N, h = N) => Array.from({ length: h }, () => ".".repeat(w));

/** Draws `sprite` onto `base` with its top-left at (x, y); transparent pixels don't overwrite. */
export function place(base, sprite, x, y) {
  const out = base.map((r) => [...r]);
  sprite.forEach((row, dy) =>
    [...row].forEach((c, dx) => {
      if (c === ".") return;
      const X = x + dx;
      const Y = y + dy;
      if (Y < 0 || Y >= out.length || X < 0 || X >= out[0].length) throw new Error(`pixel (${X},${Y}) outside the frame`);
      out[Y][X] = c;
    }),
  );
  return out.map((r) => r.join(""));
}

/** A full frame from layers: [sprite, x, y], drawn in order. */
export const frame = (...layers) => layers.reduce((f, [s, x, y]) => place(f, s, x, y), blank());

export const flipX = (rows) => rows.map((r) => [...r].reverse().join(""));
export const flipY = (rows) => [...rows].reverse();
/** Quarter turn counter-clockwise: what was at the bottom ends up on the right. */
export const rotCCW = (rows) => [...rows[0]].map((_, x) => rows.map((r) => r[r.length - 1 - x]).join(""));
/** Quarter turn clockwise: what was at the bottom ends up on the left. */
export const rotCW = (rows) => [...rows[0]].map((_, x) => rows.map((r) => r[x]).reverse().join(""));
/** The sprite cut down to its opaque box. */
export function crop(rows) {
  const { x0, y0, x1, y1 } = bounds(rows);
  return rows.slice(y0, y1 + 1).map((r) => r.slice(x0, x1 + 1));
}
/** Moves a full frame by (dx, dy); throws if an opaque pixel would leave the frame. */
export function shift(f, dx, dy) {
  const { x0, y0 } = bounds(f);
  return frame([crop(f), x0 + dx, y0 + dy]);
}
/** Replaces slots: recolor(rows, { 3: "1" }). */
export const recolor = (rows, map) => rows.map((r) => r.replace(/[1-8]/g, (c) => map[c] ?? c));

/**
 * A body from a mask: "#" is body; any other letter is a body pixel painted with `marks[letter]` (an eye, say).
 * Body pixels touching the outside (4-neighbours) become `rim`; the rest get `fill(x, y)`.
 */
export function shape(rows, { rim, fill, marks = {} }) {
  const w = rows[0].length;
  for (const r of rows) if (r.length !== w || !/^[.#a-z]*$/.test(r)) throw new Error(`bad mask row "${r}"`);
  const body = (x, y) => y >= 0 && y < rows.length && x >= 0 && x < w && rows[y][x] !== ".";
  return rows.map((r, y) =>
    [...r]
      .map((c, x) => {
        if (c === ".") return ".";
        if (c !== "#") {
          if (!marks[c]) throw new Error(`no colour for mark "${c}"`);
          return marks[c];
        }
        const edge = !body(x - 1, y) || !body(x + 1, y) || !body(x, y - 1) || !body(x, y + 1);
        return edge ? rim : fill(x, y);
      })
      .join(""),
  );
}

/** The opaque bounding box of a sprite. */
export function bounds(rows) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  rows.forEach((r, y) => [...r].forEach((c, x) => {
    if (c === ".") return;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }));
  return { x0, y0, x1, y1 };
}

export function writeSkin(skin, out) {
  for (const [name, a] of Object.entries(skin.animations))
    a.frames.forEach((f, i) => {
      if (f.length !== skin.grid || f.some((r) => r.length !== skin.grid)) throw new Error(`${skin.id}.${name}[${i}] is not ${skin.grid}×${skin.grid}`);
    });
  writeFileSync(out, JSON.stringify(skin, null, 2) + "\n");
  console.log(`wrote ${skin.id}: ${Object.keys(skin.animations).length} animations`);
}

// Accessory mounts (D2b): a frame posed with where its head and neck are, so a hat follows every pose. A mount is
// { x, y, turn, flip } (src/companion/skin.ts `Mount`): the art pixel an accessory's anchor sits on, and how the
// accessory is turned there (clockwise quarter turns, then a vertical flip).

/** A frame and its mounts (either may be null: nothing worn there in that frame). */
export const posed = (f, head = null, neck = null) => ({ f, head, neck });
/** A mount moved by (dx, dy), as when its frame is placed at an offset. */
export const at = (m, dx, dy) => m && { ...m, x: m.x + dx, y: m.y + dy };
/** The mount once its frame is turned a quarter counter-clockwise (`rotCCW`, 16-px grids). */
const rotMountCCW = (m) =>
  m && { x: m.y, y: N - 1 - m.x, turn: ((m.turn ?? 0) + (m.flip ? 90 : 270)) % 360, ...(m.flip ? { flip: true } : {}) };
/** The mount once its frame is flipped upside down (`flipY`). */
const flipMountY = (m) => m && { x: m.x, y: N - 1 - m.y, ...(m.turn ? { turn: m.turn } : {}), ...(m.flip ? {} : { flip: true }) };
export const rotPosedCCW = (p) => posed(rotCCW(p.f), rotMountCCW(p.head), rotMountCCW(p.neck));
export const flipPosedY = (p) => posed(flipY(p.f), flipMountY(p.head), flipMountY(p.neck));
/** Draws more layers over a posed frame (a heart, a "z"), keeping its mounts. */
export const over = (p, ...layers) => posed(layers.reduce((f, [s, x, y]) => place(f, s, x, y), p.f), p.head, p.neck);
/** An animation from posed frames: its `frames`, and its `rig` for both mounts. */
export const animated = (opts, frames) => ({
  ...opts,
  frames: frames.map((p) => p.f),
  rig: { head: frames.map((p) => p.head), neck: frames.map((p) => p.neck) },
});
