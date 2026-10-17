// Keyboard seek (PLAN.md §5, M1 R2): while the player's window has focus, ←/→ move 5 s back or
// forward. There is no visible seek control: the v1 contract has none (THEME_CONTRACT.md "Not in
// v1"), and T1's progress ring sits around the artwork, where no control may go.
import { interpolatePositionMs } from "../store/playerStore";
import type { NowPlaying } from "../types/player";

export const SEEK_STEP_MS = 5_000;
/** Holding a key repeats the seek at most this often (keyboard auto-repeat is ~30/s). */
export const SEEK_REPEAT_MS = 150;

export interface SeekKey {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  /** The key went to a field that uses arrows itself (the volume slider, a text field). */
  inField: boolean;
}

/** Where a key press should seek to, or null when it shouldn't seek at all. */
export function seekTargetForKey(key: SeekKey, nowPlaying: NowPlaying, positionMs: number): number | null {
  const direction = key.key === "ArrowRight" ? 1 : key.key === "ArrowLeft" ? -1 : 0;
  if (!direction || key.ctrlKey || key.altKey || key.metaKey || key.inField) return null;
  const { caps, track, status } = nowPlaying;
  if (!caps.seek || !track || (status !== "playing" && status !== "paused")) return null;
  return Math.min(Math.max(0, positionMs + direction * SEEK_STEP_MS), track.durationMs ?? Infinity);
}

const FIELD_SELECTOR = "input, textarea, select, [contenteditable]";

/** Listens for ←/→ on the document and seeks. `current` reads the live state. Returns the cleanup. */
export function installSeekKeys(
  current: () => NowPlaying,
  seek: (ms: number) => void,
  doc: Document = document,
): () => void {
  let last = 0;
  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    const nowPlaying = current();
    const now = Date.now();
    const to = seekTargetForKey(
      { key: e.key, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey, inField: Boolean(target?.closest(FIELD_SELECTOR)) },
      nowPlaying,
      interpolatePositionMs(nowPlaying, now),
    );
    if (to === null) return;
    e.preventDefault();
    if (e.repeat && now - last < SEEK_REPEAT_MS) return;
    last = now;
    seek(to);
  };
  doc.addEventListener("keydown", onKeyDown);
  return () => doc.removeEventListener("keydown", onKeyDown);
}
