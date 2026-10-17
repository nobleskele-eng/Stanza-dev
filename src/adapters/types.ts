import type { NowPlaying, SourceId } from "../types/player";

export type RepeatMode = "off" | "one" | "all";

// Adapter interface per docs/PLAN.md §3 architecture diagram: two adapters live in
// Rust (Spotify Win/mac), one in JS (SoundCloud, not built yet — v1 is Spotify-only,
// D15). All three normalize into this same shape so PlayerStore never branches on
// source type.
export interface PlayerAdapter {
  readonly source: SourceId;

  // Starts the adapter; onUpdate is called with every NowPlaying change (including
  // right after connect, with the current state, and on disconnect/error).
  connect(onUpdate: (nowPlaying: NowPlaying) => void): void;
  disconnect(): void;

  playPause(): void;
  next(): void;
  previous(): void;
  seek(ms: number): void;
  setVolume(level: number): void; // 0–1
  toggleShuffle(): void;
  setRepeat(mode: RepeatMode): void;
  /** Bring the source's own app forward, where its lyrics are (only when `caps.lyrics`). */
  showLyrics(): void;
}
