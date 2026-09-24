// Decorative text layer that a theme flows around its own shapes (design round 2, step 4).
// The text is the real title / artist / album, repeated with separators — never invented words —
// and the layer is aria-hidden (the real, readable copies are `.mp-title` etc.). The two empty <i>
// elements are the exclusion shapes: the theme floats them left/right and gives them
// `shape-outside`, so the browser does the line-by-line wrapping around circles (or anything else)
// natively. That was measured against Pretext before choosing it; see docs/DECISIONS.md.

const TARGET_CHARS = 1800; // enough to fill a card-sized area at backdrop type sizes
const MAX_REPEATS = 80;

export function flowText(title: string, artist: string, album?: string): string {
  const unit = `${[title, artist, album].filter((s): s is string => Boolean(s)).join("  ·  ")}  ·  `;
  return unit.repeat(Math.min(MAX_REPEATS, Math.max(1, Math.ceil(TARGET_CHARS / unit.length))));
}

export function Flow({ title, artist, album }: { title: string; artist: string; album?: string }) {
  return (
    <div className="mp-flow" aria-hidden="true">
      <i />
      <i />
      {flowText(title, artist, album)}
    </div>
  );
}
