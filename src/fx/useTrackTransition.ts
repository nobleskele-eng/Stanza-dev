import { useEffect, useReducer, useRef } from "react";
import { flushSync } from "react-dom";

// Track-change morph (design round 2, step 5). When the track identity changes, keep painting the OLD
// value until the browser has captured it, then swap to the new value inside
// `document.startViewTransition(...)` so the browser can animate old -> new (the theme styles the
// `::view-transition-*` pseudo-elements). Everything that is not a track change passes straight
// through with no added latency, and where the effect is off / unsupported / reduced-motion the new
// value is applied immediately.
//
// The transition only ever animates DOM the player already renders; it never changes what text is
// shown. See docs/DECISIONS.md 2026-09-23 for the artwork-fade grey area.

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => unknown };

export function supportsViewTransitions(): boolean {
  return typeof document !== "undefined" && typeof (document as ViewTransitionDocument).startViewTransition === "function";
}

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * @param value  what the component wants to render (must change identity as it updates)
 * @param key    the track identity; a change of `key` is what triggers a transition
 * @param enabled whether the morph is switched on for this player
 * @returns the value to actually render this pass
 */
export function useTrackTransition<T>(value: T, key: string, enabled: boolean): T {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const settledKey = useRef(key);
  const held = useRef(value);
  const pendingKey = useRef<string | null>(null);

  // Effect off: never hold anything back (no stale frame), and stay in sync so turning it on later
  // doesn't see a phantom key change.
  if (!enabled) settledKey.current = key;
  const settled = key === settledKey.current;
  if (settled) held.current = value; // pass-through: zero lag for position ticks, status changes, ...
  const out = settled ? value : held.current;

  useEffect(() => {
    if (key === settledKey.current || pendingKey.current === key) return;
    pendingKey.current = key;
    const apply = () => {
      settledKey.current = key;
      pendingKey.current = null;
    };
    const doc = document as ViewTransitionDocument;
    if (supportsViewTransitions() && !prefersReducedMotion()) {
      doc.startViewTransition!(() => {
        apply();
        flushSync(rerender); // the new DOM must exist before the callback returns, or the browser captures the old one twice
      });
    } else {
      apply();
      rerender();
    }
  }, [key, enabled]);

  return out;
}
