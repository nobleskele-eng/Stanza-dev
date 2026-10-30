// The companion in the production player (PLAN.md §4b, M2 C2b, C3b). It lives in `.mp-root` outside `.mp-window` (like
// the effect filters), in a fixed, zero-size layer at the window's origin, so no theme's positioning or clipping can
// reach it. The layer measures `.mp-window`'s outline and the parts near its top, and re-measures when any of them
// move (the card's height changes with its state, T3 reveals its controls on hover), so the pet rides a moving edge.
// The window's margin on every side (App.tsx) is the room it climbs and hangs in.
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { hashString } from "../fx/beat";
import { Companion } from "./Companion";
import { measureOutline, type Box } from "./measure";
import { artPixelPx } from "./pixel";
import type { EdgeBox, Outline } from "./place";
import type { Skin } from "./skin";
import { useDevicePixelRatio } from "./useDevicePixelRatio";

/** The parts the pet must never sit on (CLAUDE.md: nothing interactive over the artwork; the badge is required). */
const PART_SELECTOR = [
  ".mp-artwork", ".mp-meta", ".mp-progress", ".mp-time-current", ".mp-time-total", ".mp-controls",
  ".mp-volume-wrap", ".mp-link-out", ".mp-source-badge", ".mp-empty", ".mp-error",
].join(", ");

interface Measured {
  edge: EdgeBox;
  outline: Outline;
  blocked: [number, number][];
}

const toBox = (r: DOMRect): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });

export function CompanionLayer({
  skin,
  palette,
  playing,
  trackKey,
  windowRef,
}: {
  skin: Skin;
  palette: string;
  playing: boolean;
  trackKey: string;
  /** The player's `.mp-window`: the card whose top edge the pet stands on. */
  windowRef: RefObject<HTMLElement | null>;
}) {
  const dpr = useDevicePixelRatio();
  const px = artPixelPx(dpr);
  const [measured, setMeasured] = useState<Measured | null>(null);
  const sent = useRef("");

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
      const { edge, outline, blocked } = measureOutline(
        skin,
        { left: snap(r.left), top: snap(r.top), right: snap(r.right), bottom: snap(r.bottom) },
        [...card.querySelectorAll(PART_SELECTOR)].map((el) => toBox(el.getBoundingClientRect())),
        px,
      );
      const next: Measured = { edge, outline, blocked };
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
  }, [windowRef, skin, dpr, px]);

  return (
    <div className="mp-companion-layer" aria-hidden="true">
      {measured && (
        <Companion
          // A new skin is a new body: restart its brain.
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
        />
      )}
    </div>
  );
}
