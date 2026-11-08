// One sprite frame (rows of palette characters) as SVG path data: one path per palette slot, each
// a set of 1-high rectangles merged along runs. Pure; rendered by Sprite.tsx with
// `shape-rendering: crispEdges`, in art-pixel units (the viewBox is the grid).

/** A frame row character: "." is transparent, "1"–"8" are palette slots, "a"–"c" an accessory's colours (D2b). */
export const TRANSPARENT = ".";

export interface SlotPath {
  /** The slot's character: a palette slot "1"–"8", or an accessory colour "a"–"c". */
  slot: string;
  d: string;
}

export function frameToPaths(frame: readonly string[]): SlotPath[] {
  const bySlot = new Map<string, string[]>();
  frame.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === c) end++;
      if (c !== TRANSPARENT) {
        const runs = bySlot.get(c) ?? [];
        runs.push(`M${x} ${y}h${end - x}v1h${x - end}z`);
        bySlot.set(c, runs);
      }
      x = end;
    }
  });
  return [...bySlot.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([slot, runs]) => ({ slot, d: runs.join("") }));
}
