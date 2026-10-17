import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { IDLE_NOW_PLAYING, type NowPlaying } from "../types/player";
import { interpolatePositionMs, type PlayerStore } from "./playerStore";

/** A tick lands this long after the second boundary, so a timer firing a little early can't miss it. */
export const TICK_SLACK_MS = 15;

/** The store's current NowPlaying, re-rendering on every change. A null store is always idle. */
export function useStoreSnapshot(store: PlayerStore | null): NowPlaying {
  const subscribe = useCallback((onChange: () => void) => (store ? store.subscribe(onChange) : () => {}), [store]);
  return useSyncExternalStore(subscribe, () => store?.getSnapshot() ?? IDLE_NOW_PLAYING);
}

/** How long until a playing position next crosses a whole second (when an m:ss label changes). */
export function msToNextSecond(positionMs: number): number {
  return 1000 - (Math.max(0, positionMs) % 1000);
}

/**
 * C10: the position is only current as of `positionUpdatedAt`, so while playing it is
 * re-interpolated once a second, just as the shown second changes. It used to be every 250 ms;
 * each tick repaints whatever a theme draws from `--mp-progress`, and four a second kept T5's window
 * busy (docs/DECISIONS.md, 2026-10-17 CPU pass). Paused, idle or stopped: no timer runs at all.
 */
export function useInterpolatedPosition(nowPlaying: NowPlaying): number {
  const [now, setNow] = useState(() => Date.now());
  const playing = nowPlaying.status === "playing";
  useEffect(() => {
    setNow(Date.now());
    if (!playing) return;
    let timer = 0;
    const schedule = () => {
      const wait = msToNextSecond(interpolatePositionMs(nowPlaying, Date.now())) + TICK_SLACK_MS;
      timer = window.setTimeout(() => {
        setNow(Date.now());
        schedule();
      }, wait);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [playing, nowPlaying]);
  return interpolatePositionMs(nowPlaying, now);
}
