// The companion in the production player (PLAN.md §4b, M2 C2b, C3b). It lives in `.mp-root` outside `.mp-window` (like
// the effect filters), in a fixed, zero-size layer at the window's origin, so no theme's positioning or clipping can
// reach it. The layer measures `.mp-window`'s outline and the parts near its top, and re-measures when any of them
// move (the card's height changes with its state, T3 reveals its controls on hover), so the pet rides a moving edge.
// The window's margin on every side (App.tsx) is the room it climbs and hangs in. The pet takes the pointer (C4b): it
// can be clicked, and carried over the card and its margin, but never over the artwork, which it's told to avoid. A
// theme can give it a shelf inside the card (C5b, contract v10): the layer measures where, from the part it's beside.
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { hashString } from "../fx/beat";
import type { ShelfDeclaration } from "../theme/variant";
import { Companion } from "./Companion";
import { measureOutline, measureShelf, shelfLine, type Box, type Shelf } from "./measure";
import { artPixelPx } from "./pixel";
import type { EdgeBox, Outline } from "./place";
import type { Skin } from "./skin";
import { useDevicePixelRatio } from "./useDevicePixelRatio";

/** The parts the pet must never sit on (CLAUDE.md: nothing interactive over the artwork; the badge is required). */
const PART_SELECTOR = [
  ".mp-artwork", ".mp-meta", ".mp-progress", ".mp-time-current", ".mp-time-total", ".mp-controls",
  ".mp-volume-wrap", ".mp-link-out", ".mp-source-badge", ".mp-empty", ".mp-error",
].join(", ");

/** What a carried or falling pet never covers (CLAUDE.md: nothing interactive over the artwork). */
const AVOID_SELECTOR = ".mp-artwork";

interface Measured {
  edge: EdgeBox;
  outline: Outline;
  blocked: [number, number][];
  avoid: Outline[];
  shelf: Shelf | null;
}

const toBox = (r: DOMRect): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });

export function CompanionLayer({
  skin,
  palette,
  playing,
  trackKey,
  windowRef,
  shelf,
}: {
  skin: Skin;
  palette: string;
  playing: boolean;
  trackKey: string;
  /** The player's `.mp-window`: the card whose top edge the pet stands on. */
  windowRef: RefObject<HTMLElement | null>;
  /** The theme's shelf (its theme.json `companion.shelf`), if it has one. */
  shelf?: ShelfDeclaration;
}) {
  const dpr = useDevicePixelRatio();
  const px = artPixelPx(dpr);
  const [measured, setMeasured] = useState<Measured | null>(null);
  const sent = useRef("");
  const shelfSide = shelf?.side;
  const shelfBeside = shelf?.beside;

  useLayoutEffect(() => {
    const card = windowRef.current;
    if (!card) return;
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    let frame = 0;
    const measure = () => {
      frame = 0;
      // The card's sides on whole device px, so the art never lands between them (the C1 sharpness rule) and the right
      // side and the bottom sit exactly where the card ends.
      const r = toBox(card.getBoundingClientRect());
      const box = { left: snap(r.left), top: snap(r.top), right: snap(r.right), bottom: snap(r.bottom) };
      const parts = [...card.querySelectorAll(PART_SELECTOR)].map((el) => toBox(el.getBoundingClientRect()));
      const { edge, outline, blocked } = measureOutline(skin, box, parts, px);
      // The shelf's line on whole device px too: level with the base of the part it's beside.
      const beside = shelfSide && shelfBeside ? card.querySelector(shelfBeside) : null;
      const b = beside ? toBox(beside.getBoundingClientRect()) : null;
      const line = shelfSide && b ? shelfLine(shelfSide, box, { left: snap(b.left), top: snap(b.top), right: snap(b.right), bottom: snap(b.bottom) }) : null;
      const shelfFound = line ? measureShelf(skin, box, line, parts, px) : null;
      const avoid = [...card.querySelectorAll(AVOID_SELECTOR)]
        .map((el) => el.getBoundingClientRect())
        .filter((b) => b.width > 0 && b.height > 0)
        .map((b): Outline => ({ left: b.left, top: b.top, width: b.width, height: b.height }));
      const next: Measured = { edge, outline, blocked, avoid, shelf: shelfFound };
      const key = JSON.stringify(next);
      if (key === sent.current) return;
      sent.current = key;
      setMeasured(next);
    };
    const schedule = () => {
      frame ||= window.requestAnimationFrame(measure);
    };
    measure();
    const resize = new ResizeObserver(schedule);
    resize.observe(card);
    // Parts come and go with the playback state, and a theme can move them when the pointer enters.
    const mutations = new MutationObserver(schedule);
    mutations.observe(card, { childList: true, subtree: true });
    const root = card.parentElement;
    // Not every attribute: the root's inline style changes with the playback position, which never moves a part.
    if (root) mutations.observe(root, { attributes: true, attributeFilter: ["data-hover", "data-layout", "data-theme", "data-status"] });
    const events = ["transitionend", "animationend", "resize"] as const;
    for (const type of events) window.addEventListener(type, schedule, true);
    return () => {
      window.cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      for (const type of events) window.removeEventListener(type, schedule, true);
      sent.current = "";
    };
  }, [windowRef, skin, dpr, px, shelfSide, shelfBeside]);

  return (
    <div className="mp-companion-layer" aria-hidden="true">
      {measured && (
        <Companion
          // A new species is a new body: restart its brain. A new accessory (D2c, the same id, dressed) keeps its place.
          key={skin.id}
          skin={skin}
          palette={palette}
          playing={playing}
          trackKey={trackKey}
          edge={measured.edge}
          outline={measured.outline}
          blocked={measured.blocked}
          seed={hashString(skin.id)}
          dpr={dpr}
          interactive
          avoid={measured.avoid}
          shelf={measured.shelf}
        />
      )}
    </div>
  );
}
