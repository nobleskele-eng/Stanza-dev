import type { PlayerAdapter, RepeatMode } from "./types";
import type { NowPlaying, SourceId } from "../types/player";

/**
 * Adapter for browser/dev-mode UI work (docs/PLAN.md §4 "Fixtures" — fastest loop
 * for design iteration without Tauri). Holds no fixture strings itself; it's fed
 * NowPlaying values from outside (see src/dev/DevHarness.tsx, which is the only
 * caller allowed to import from /dev/fixtures).
 */
export class MockAdapter implements PlayerAdapter {
  readonly source: SourceId;
  private current: NowPlaying;
  private onUpdate: ((nowPlaying: NowPlaying) => void) | null = null;

  constructor(source: SourceId, initial: NowPlaying) {
    this.source = source;
    this.current = initial;
  }

  connect(onUpdate: (nowPlaying: NowPlaying) => void): void {
    this.onUpdate = onUpdate;
    onUpdate(this.current);
  }

  disconnect(): void {
    this.onUpdate = null;
  }

  /** Test/dev-only hook: push a new fixture state as if the adapter observed it. */
  setState(nowPlaying: NowPlaying): void {
    this.current = nowPlaying;
    this.onUpdate?.(nowPlaying);
  }

  playPause(): void {
    const status = this.current.status === "playing" ? "paused" : "playing";
    this.setState({ ...this.current, status, positionUpdatedAt: Date.now() });
  }

  next(): void {
    // No real track list in the mock — dev harness swaps fixtures directly instead.
  }

  previous(): void {
    // Same as next().
  }

  seek(ms: number): void {
    this.setState({ ...this.current, positionMs: ms, positionUpdatedAt: Date.now() });
  }

  setVolume(level: number): void {
    this.setState({ ...this.current, volume: level });
  }

  toggleShuffle(): void {
    // No-op in the mock; nothing currently reads a shuffle flag from NowPlaying.
  }

  setRepeat(_mode: RepeatMode): void {
    // No-op in the mock; see toggleShuffle().
  }

  showLyrics(): void {
    // No app to bring forward in the browser.
  }
}
