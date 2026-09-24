import { useEffect, type RefObject } from "react";
import { beatAt, rhythmFor } from "./beat";

const FRAME_MS = 33; // ~30fps: a subtle decorative signal doesn't need 60

/**
 * Writes the simulated `--mp-beat` (0–1, see beat.ts — NOT real audio analysis) onto the given
 * elements, not `.mp-root`, so a per-frame style change only restyles the small subtrees that use
 * it. Holds at 0 when inactive (paused, effect off) and under prefers-reduced-motion.
 */
export function useBeat(
  refs: ReadonlyArray<RefObject<Element | null>>,
  active: boolean,
  title: string,
  artist: string,
): void {
  useEffect(() => {
    const els = () => refs.map((r) => r.current).filter((e): e is HTMLElement | SVGElement => e instanceof HTMLElement || e instanceof SVGElement);
    const set = (v: number) => els().forEach((e) => e.style.setProperty("--mp-beat", v.toFixed(3)));
    if (!active) {
      set(0);
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const rhythm = rhythmFor(title, artist);
    const t0 = performance.now();
    let last = 0;
    let raf = requestAnimationFrame(function tick(now) {
      if (now - last >= FRAME_MS) {
        last = now;
        set(reduce.matches ? 0 : beatAt(rhythm, (now - t0) / 1000));
      }
      raf = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(raf);
      set(0);
    };
    // refs are stable ref objects; effect intentionally keyed on the seed + active only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, title, artist]);
}
