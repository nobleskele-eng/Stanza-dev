// Pure helpers for the split-flap title (design round 2, step 3). The flap library
// (@splitflap/core) works on fixed-width cells and UTF-16 code units, and upper-cases what it is
// given, so long or unusual titles need care before they reach it. Nothing here invents text:
// pages are slices of the real string and the flip alphabet is built only from letters that
// appear in the old and new titles.

// Intl.Segmenter isn't in this project's TS lib target, so it is typed locally (present in WebView2/WKWebView).
interface GraphemeSegmenter {
  segment(input: string): Iterable<{ segment: string }>;
}
const SegmenterCtor = (typeof Intl !== "undefined" ? (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: "grapheme" }) => GraphemeSegmenter }).Segmenter : undefined);
const segmenter = SegmenterCtor ? new SegmenterCtor(undefined, { granularity: "grapheme" }) : null;

/** Grapheme clusters (so "é" written as e + combining accent stays one unit); falls back to code points. */
export function graphemes(s: string): string[] {
  return segmenter ? [...segmenter.segment(s)].map((x) => x.segment) : Array.from(s);
}

/**
 * Splits a title into pages of at most `cols` graphemes: greedy word packing (single spaces),
 * and a word longer than a page is hard-split. Whitespace is normalised. Concatenating the pages
 * and dropping spaces always reproduces the original text with its spaces dropped — no character is
 * ever lost or added. Empty input gives one empty page.
 */
export function paginate(text: string, cols: number): string[] {
  if (cols < 1) throw new Error("cols must be >= 1");
  const words = text.split(/\s+/).filter(Boolean);
  const pages: string[] = [];
  let line: string[] = [];
  let used = 0;
  const flush = () => {
    if (line.length > 0) pages.push(line.join(""));
    line = [];
    used = 0;
  };
  for (const word of words) {
    const g = graphemes(word);
    for (let i = 0; i < g.length; i += cols) {
      const chunk = g.slice(i, i + cols);
      const need = chunk.length + (used > 0 ? 1 : 0);
      if (used + need > cols) flush();
      if (used > 0) {
        line.push(" ");
        used += 1;
      }
      line.push(chunk.join(""));
      used += chunk.length;
    }
  }
  flush();
  return pages.length > 0 ? pages : [""];
}

/** Centre-pads a page with spaces to exactly `cols` cells (extra space goes to the right). */
export function padPage(page: string, cols: number): string {
  const n = graphemes(page).length;
  const total = Math.max(0, cols - n);
  const left = Math.floor(total / 2);
  return " ".repeat(left) + page + " ".repeat(total - left);
}

/**
 * The flip alphabet: a space plus the distinct upper-cased letters of every page shown or about to
 * be shown, in code-point order. The flaps therefore only ever cycle through characters that are
 * part of the real old/new titles.
 */
export function flapAlphabet(pages: readonly string[]): string {
  const set = new Set<string>([" "]);
  for (const p of pages) for (const ch of graphemes(p.toUpperCase())) set.add(ch);
  return [...set].sort().join("");
}

/**
 * The library reads strings one UTF-16 code unit at a time and upper-cases them. A title is only
 * flap-safe if, after upper-casing, every grapheme is exactly one code unit (so no emoji, astral
 * CJK or combining sequences). Length-changing upper-casing like ß→SS is fine as long as callers
 * upper-case first and paginate/pad the upper-cased text. Otherwise show the plain text instead of
 * a garbled board.
 */
export function isFlapSafe(text: string, cols: number): boolean {
  const upper = text.toUpperCase();
  const g = graphemes(upper);
  return g.every((c) => c.length === 1) && paginate(upper, cols).every((p) => graphemes(p).length <= cols);
}
