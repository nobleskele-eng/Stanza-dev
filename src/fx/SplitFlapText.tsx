import { useEffect, useRef, type CSSProperties } from "react";
import { SplitFlap } from "@splitflap/core";
import { flapAlphabet, flapPageAfter, padPage, paginate } from "./flap";

// Split-flap (Solari board) rendering of the REAL title/artist (design round 2, step 3).
// @splitflap/core (MIT, zero deps, no sound). Constraints handled here rather than trusted to it:
//  - it upper-cases and works per UTF-16 unit  -> we upper-case first, paginate/pad ourselves and
//    fall back to plain text (AnimatedText) for text it would garble (see flap.ts `isFlapSafe`);
//  - it flips through every letter of its alphabet on the way to the target -> the alphabet is
//    ONLY the distinct letters of the old and new titles (+ space), so no glyph outside the real
//    text is ever shown, and `maxFlips` keeps the run short;
//  - fixed-width cells -> titles longer than the row page through in chunks of real words.
// The accessible name is a visually-hidden copy of the real string; the board is aria-hidden.

export type FlapKind = "title" | "artist";

/** Cell geometry per kind. Content width in the card is ~200px, so cols*w must stay <= 200. */
export const FLAP_GEOMETRY: Record<FlapKind, { cols: number; w: number; h: number }> = {
  title: { cols: 10, w: 20, h: 26 },
  artist: { cols: 14, w: 14, h: 18 },
};

export const flapKindOf = (className: string): FlapKind => (className.includes("artist") ? "artist" : "title");

const PAGE_MS = 3200;

// What each kind last showed (already upper-cased and padded). The player remounts these on every
// track change (Player's `.mp-meta` key), so the board would otherwise always start blank; this lets
// it flip FROM the previous real title TO the new one. Module-level on purpose: one player per page.
const lastShown: Partial<Record<FlapKind, string>> = {};

const SR_ONLY: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
};

export function SplitFlapText({ className, text }: { className: string; text: string }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const kind = flapKindOf(className);
  const { cols, w, h } = FLAP_GEOMETRY[kind];

  useEffect(() => {
    const host = boardRef.current;
    if (!host) return;
    const pages = paginate(text.toUpperCase(), cols).map((p) => padPage(p, cols));
    const from = lastShown[kind] ?? padPage("", cols);
    const board = new SplitFlap(host, {
      text: pages[0],
      textInit: from,
      charsMap: flapAlphabet([...pages, from]),
      charWidth: w,
      charHeight: h,
      speed: 14,
      speedVariation: 6,
      stagger: 0.025,
      maxFlips: 6,
      fontFamily: "var(--mp-font-display, sans-serif)",
      fontWeight: "700",
      textColor: "var(--mp-flap-fg, var(--mp-fg, #fff))",
      charBackground: "var(--mp-flap-bg, var(--mp-bg, #222))",
      dividerColor: "var(--mp-flap-edge, rgba(0, 0, 0, 0.6))",
    });
    lastShown[kind] = pages[0];

    // Long titles page through twice per track, then rest on the first page (flapPageAfter).
    let page = 0;
    let flips = 0;
    const timer =
      pages.length > 1
        ? window.setInterval(() => {
            const next = flapPageAfter(++flips, pages.length);
            if (next === null) return window.clearInterval(timer);
            const previous = pages[page];
            page = next;
            board.setText(pages[page], previous);
            lastShown[kind] = pages[page];
            if (flapPageAfter(flips + 1, pages.length) === null) window.clearInterval(timer);
          }, PAGE_MS)
        : undefined;

    return () => {
      if (timer !== undefined) window.clearInterval(timer);
      board.destroy();
    };
  }, [text, kind, cols, w, h]);

  return (
    <div className={className} data-flap="" style={{ position: "relative" }}>
      <span style={SR_ONLY}>{text}</span>
      <div ref={boardRef} aria-hidden="true" style={{ width: cols * w, height: h, margin: "0 auto" }} />
    </div>
  );
}
