// Turns the Rust Spotify worker's states (src-tauri/src/spotify) into NowPlaying values. Pure, so
// the ordering and artwork rules are unit-tested without Tauri; SpotifyAdapter is the IPC glue.
import { IDLE_NOW_PLAYING, type NowPlaying } from "../types/player";

/** Wire format of Rust's `SpotifyState` (src-tauri/src/spotify/mod.rs). */
export interface SpotifyState {
  /** Increases with every change Rust publishes. */
  seq: number;
  /** A Spotify GSMTC session exists (Spotify is running). */
  session: boolean;
  status: "playing" | "paused" | "idle";
  title: string;
  artist: string;
  album: string;
  /** 0 = no artwork; any other value names one image. */
  artworkId: number;
  /** `data:` URL of `artworkId`. Always in a pull; in an event only when the id changed. */
  artwork: string | null;
  positionMs: number;
  durationMs: number;
  /** Unix ms at which `positionMs` was current (C10). */
  positionUpdatedAt: number;
  canSeek: boolean;
}

/** No Spotify session (Spotify not running): `unavailable` with no track (THEME_CONTRACT.md per-state table). */
export const NOT_RUNNING: NowPlaying = { ...IDLE_NOW_PLAYING, status: "unavailable" };

/**
 * One state as the player shows it. No session → not running; a session with nothing loaded
 * (empty title) or stopped → idle. Shuffle/repeat stay off: the v1 contract has no controls for
 * them, and volume needs S5 (Core Audio). GSMTC always reports the album field, so `album` is on
 * whenever there is one.
 */
export function toNowPlaying(state: SpotifyState, artwork: string | undefined): NowPlaying {
  if (!state.session) return NOT_RUNNING;
  if (state.status === "idle" || state.title === "") return IDLE_NOW_PLAYING;
  return {
    source: "spotify",
    status: state.status,
    track: {
      title: state.title,
      artist: state.artist,
      album: state.album || undefined,
      artwork,
      durationMs: state.durationMs > 0 ? state.durationMs : undefined,
    },
    positionMs: Math.max(0, state.positionMs),
    positionUpdatedAt: state.positionUpdatedAt,
    caps: { seek: state.canSeek, volume: false, shuffle: false, repeat: false, album: true },
  };
}

/**
 * Orders pulls and events by `seq` (a pull answered after a newer event is stale) and keeps
 * artwork that later events leave out. `accept` returns what the player should show now, or null
 * when nothing visible changed.
 */
export class SpotifyFeed {
  private latest: SpotifyState | null = null;
  private artwork = new Map<number, string>();

  accept(state: SpotifyState | null | undefined): NowPlaying | null {
    if (!state || typeof state.seq !== "number") return null;
    const known = this.latest;
    const newer = !known || state.seq > known.seq;
    if (newer) this.latest = state;
    const current = this.latest!;

    let artworkArrived = false;
    if (state.artwork !== null && state.artworkId !== 0 && !this.artwork.has(state.artworkId)) {
      this.artwork.set(state.artworkId, state.artwork);
      artworkArrived = state.artworkId === current.artworkId;
    }
    // Only the current image is ever needed again.
    for (const id of this.artwork.keys()) if (id !== current.artworkId) this.artwork.delete(id);

    if (!newer && !artworkArrived) return null;
    return toNowPlaying(current, this.artwork.get(current.artworkId));
  }

  reset(): void {
    this.latest = null;
    this.artwork.clear();
  }
}
