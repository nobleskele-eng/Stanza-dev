import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { IDLE_NOW_PLAYING, type NowPlaying } from "../types/player";
import { interpolatePositionMs, type PlayerStore } from "./playerStore";

/** How often a playing track's position is re-interpolated for display (time labels, progress). */
export const POSITION_TICK_MS = 250;

/** The store's current NowPlaying, re-rendering on every change. A null store is always idle. */
export function useStoreSnapshot(store: PlayerStore | null): NowPlaying {
  const subscribe = useCallback((onChange: () => void) => (store ? store.subscribe(onChange) : () => {}), [store]);
  return useSyncExternalStore(subscribe, () => store?.getSnapshot() ?? IDLE_NOW_PLAYING);
}

/**
 * C10: the position is only current as of `positionUpdatedAt`, so while playing it is
 * re-interpolated every tick. Paused, idle or stopped: no timer runs at all.
 */
export function useInterpolatedPosition(nowPlaying: NowPlaying, everyMs = POSITION_TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());
  const playing = nowPlaying.status === "playing";
  useEffect(() => {
    setNow(Date.now());
    if (!playing) return;
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [playing, nowPlaying, everyMs]);
  return interpolatePositionMs(nowPlaying, now);
}
