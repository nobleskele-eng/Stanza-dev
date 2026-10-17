// Core playback types. Shape follows docs/PLAN.md §3 "State model".
// v1 ships Spotify-only (D15); SourceId keeps 'soundcloud' as a future variant
// so the store/adapter interfaces don't need reshaping when that source lands.

export type SourceId = "spotify" | "soundcloud";

export type Status = "idle" | "playing" | "paused" | "unavailable" | "error";

export interface Capabilities {
  seek: boolean;
  volume: boolean;
  shuffle: boolean;
  repeat: boolean;
  /** The source's own app can be brought forward to show lyrics (the lyrics button, S6). */
  lyrics: boolean;
  album: boolean;
}

export interface Track {
  title: string;
  artist: string;
  album?: string;
  artwork?: string; // URL or data URL
  permalink?: string; // link-out target
  durationMs?: number;
}

export interface PlayerError {
  code: string;
  detail: string;
}

export interface NowPlaying {
  source: SourceId;
  status: Status;
  track?: Track;
  positionMs: number;
  positionUpdatedAt: number; // epoch ms, for interpolation (C10)
  volume?: number; // 0–1, the source's own level; present when caps.volume
  caps: Capabilities;
  error?: PlayerError;
}

export const NO_CAPS: Capabilities = {
  seek: false,
  volume: false,
  shuffle: false,
  repeat: false,
  lyrics: false,
  album: false,
};

export const IDLE_NOW_PLAYING: NowPlaying = {
  source: "spotify",
  status: "idle",
  positionMs: 0,
  positionUpdatedAt: 0,
  caps: NO_CAPS,
};
