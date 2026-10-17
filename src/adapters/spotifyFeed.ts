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

/** Wire format of Rust's `SpotifyVolume`: Spotify's own level in the Windows mixer (S5, Core Audio). */
export interface SpotifyVolume {
  /** Spotify has an audio session to set (it has played since it started). */
  available: boolean;
  /** 0–1. */
  level: number;
}

/**
 * One state as the player shows it. No session → not running; a session with nothing loaded
 * (empty title) or stopped → idle. Volume is on when Spotify has an audio session (S5). Shuffle and
 * repeat stay off: the v1 contract has no controls for them. GSMTC always reports the album field,
 * so `album` is on whenever there is one.
 */
export function toNowPlaying(state: SpotifyState, artwork: string | undefined, volume?: SpotifyVolume | null): NowPlaying {
  if (!state.session) return NOT_RUNNING;
  if (state.status === "idle" || state.title === "") return IDLE_NOW_PLAYING;
  const hasVolume = Boolean(volume?.available);
  return {
    ...(hasVolume && { volume: Math.min(1, Math.max(0, volume!.level)) }),
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
    // lyrics: the button brings Spotify's own window forward (S6), which a running session implies.
    caps: { seek: state.canSeek, volume: hasVolume, shuffle: false, repeat: false, album: true, lyrics: true },
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
  private volume: SpotifyVolume | null = null;
  private volumeEventSeen = false;

  /**
   * A volume report. Volume reports carry no `seq`, so once an event has arrived, a pull (always
   * requested before it, possibly answered after it) is stale and ignored.
   */
  acceptVolume(volume: SpotifyVolume | null | undefined, from: "pull" | "event"): NowPlaying | null {
    if (!volume || typeof volume.level !== "number" || !Number.isFinite(volume.level)) return null;
    if (from === "pull" && this.volumeEventSeen) return null;
    if (from === "event") this.volumeEventSeen = true;
    this.volume = { available: Boolean(volume.available), level: volume.level };
    const current = this.latest;
    return current ? toNowPlaying(current, this.artwork.get(current.artworkId), this.volume) : null;
  }

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
    return toNowPlaying(current, this.artwork.get(current.artworkId), this.volume);
  }

  reset(): void {
    this.latest = null;
    this.artwork.clear();
    this.volume = null;
    this.volumeEventSeen = false;
  }
}
