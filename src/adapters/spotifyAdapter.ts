import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { NowPlaying } from "../types/player";
import { SpotifyFeed, type SpotifyState } from "./spotifyFeed";
import type { PlayerAdapter, RepeatMode } from "./types";

/** Rust's `spotify::STATE_EVENT`. */
export const SPOTIFY_STATE_EVENT = "spotify:state";

/**
 * Spotify through the Rust worker (src-tauri/src/spotify): GSMTC on Windows (D5). Listens first,
 * then pulls the current state, so no change can fall between the two; `SpotifyFeed` orders them.
 * Only for Tauri: the production app creates it only there.
 */
export class SpotifyAdapter implements PlayerAdapter {
  readonly source = "spotify" as const;
  private feed = new SpotifyFeed();
  private unlisten: UnlistenFn | null = null;
  /** Bumped by every connect/disconnect, so callbacks from an earlier connection are ignored. */
  private generation = 0;

  connect(onUpdate: (nowPlaying: NowPlaying) => void): void {
    const generation = ++this.generation;
    this.feed.reset();
    const live = () => generation === this.generation;
    const accept = (state: SpotifyState | null) => {
      if (!live()) return;
      const next = this.feed.accept(state);
      if (next) onUpdate(next);
    };
    listen<SpotifyState>(SPOTIFY_STATE_EVENT, (e) => accept(e.payload))
      .then((unlisten) => {
        if (!live()) return unlisten();
        this.unlisten = unlisten;
        return invoke<SpotifyState | null>("spotify_state").then(accept);
      })
      .catch((e) => console.error("Spotify adapter failed to connect", e));
  }

  disconnect(): void {
    this.generation++;
    this.unlisten?.();
    this.unlisten = null;
    this.feed.reset();
  }

  playPause(): void {
    this.send("spotify_play_pause");
  }

  next(): void {
    this.send("spotify_next");
  }

  previous(): void {
    this.send("spotify_previous");
  }

  seek(ms: number): void {
    this.send("spotify_seek", { positionMs: Math.max(0, Math.round(ms)) });
  }

  setVolume(_level: number): void {
    // GSMTC has no volume (PLAN.md §3); per-app volume through Core Audio is S5 (M1 R3).
  }

  toggleShuffle(): void {
    // No shuffle control in the v1 contract (THEME_CONTRACT.md "Not in v1"), so nothing calls this yet.
  }

  setRepeat(_mode: RepeatMode): void {
    // Same as toggleShuffle().
  }

  private send(cmd: string, args?: Record<string, unknown>): void {
    // The new state arrives as an event; a false answer (no session, Spotify refused) changes nothing.
    invoke<boolean>(cmd, args).catch((e) => console.error(`${cmd} failed`, e));
  }
}
