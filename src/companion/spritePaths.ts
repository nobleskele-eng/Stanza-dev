// One sprite frame (rows of palette characters) as SVG path data: one path per palette slot, each
// a set of 1-high rectangles merged along runs. Pure; rendered by Sprite.tsx with
// `shape-rendering: crispEdges`, in art-pixel units (the viewBox is the grid).

/** A frame row character: "." is transparent, "1"–"8" are palette slots. */
export const TRANSPARENT = ".";

export interface SlotPath {
  /** Palette slot, 1-based. */
  slot: number;
  d: string;
}

export function frameToPaths(frame: readonly string[]): SlotPath[] {
  const bySlot = new Map<number, string[]>();
  frame.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === c) end++;
      if (c !== TRANSPARENT) {
        const slot = Number(c);
        const runs = bySlot.get(slot) ?? [];
        runs.push(`M${x} ${y}h${end - x}v1h${x - end}z`);
        bySlot.set(slot, runs);
      }
      x = end;
    }
  });
  return [...bySlot.entries()].sort(([a], [b]) => a - b).map(([slot, runs]) => ({ slot, d: runs.join("") }));
}
