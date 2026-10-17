import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { NowPlaying } from "../types/player";
import { SpotifyFeed, type SpotifyState, type SpotifyVolume } from "./spotifyFeed";
import type { PlayerAdapter, RepeatMode } from "./types";

/** Rust's `spotify::STATE_EVENT` / `spotify::VOLUME_EVENT`. */
export const SPOTIFY_STATE_EVENT = "spotify:state";
export const SPOTIFY_VOLUME_EVENT = "spotify:volume";

/**
 * After a local volume change, Spotify's own volume reports are held this long. Otherwise a report
 * of an earlier step of a drag (sent before the latest one was applied) would pull the slider back.
 * The newest held report is applied when the hold ends.
 */
export const VOLUME_HOLD_MS = 400;

/**
 * Spotify through the Rust workers (src-tauri/src/spotify): GSMTC for now-playing and transport (D5),
 * Core Audio for its own volume (S5). Listens first, then pulls the current state, so no change can
 * fall between the two; `SpotifyFeed` orders them. Only for Tauri: the production app creates it
 * only there.
 */
export class SpotifyAdapter implements PlayerAdapter {
  readonly source = "spotify" as const;
  private feed = new SpotifyFeed();
  private unlisten: UnlistenFn[] = [];
  /** Bumped by every connect/disconnect, so callbacks from an earlier connection are ignored. */
  private generation = 0;
  private onUpdate: ((nowPlaying: NowPlaying) => void) | null = null;
  // Volume: one set in flight at a time, newest level waiting (latest wins while dragging).
  private volumeInFlight = false;
  private volumePending: number | null = null;
  private holdUntil = 0;
  private held: { volume: SpotifyVolume; from: "pull" | "event" } | null = null;
  private holdTimer = 0;

  connect(onUpdate: (nowPlaying: NowPlaying) => void): void {
    const generation = ++this.generation;
    this.feed.reset();
    this.onUpdate = onUpdate;
    const live = () => generation === this.generation;
    const emit = (next: NowPlaying | null) => {
      if (next && live()) onUpdate(next);
    };
    const acceptState = (state: SpotifyState | null) => {
      if (live()) emit(this.feed.accept(state));
    };
    const acceptVolume = (volume: SpotifyVolume | null, from: "pull" | "event") => {
      if (live()) this.takeVolume(volume, from);
    };
    const start = async () => {
      const unlisten = await Promise.all([
        listen<SpotifyState>(SPOTIFY_STATE_EVENT, (e) => acceptState(e.payload)),
        listen<SpotifyVolume>(SPOTIFY_VOLUME_EVENT, (e) => acceptVolume(e.payload, "event")),
      ]);
      if (!live()) {
        unlisten.forEach((u) => u());
        return;
      }
      this.unlisten = unlisten;
      await Promise.all([
        invoke<SpotifyState | null>("spotify_state").then(acceptState),
        invoke<SpotifyVolume | null>("spotify_volume").then((v) => acceptVolume(v, "pull")),
      ]);
    };
    start().catch((e) => console.error("Spotify adapter failed to connect", e));
  }

  disconnect(): void {
    this.generation++;
    this.unlisten.forEach((u) => u());
    this.unlisten = [];
    this.onUpdate = null;
    window.clearTimeout(this.holdTimer);
    this.held = null;
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

  /** Spotify's own level (S5). While dragging, only the newest level waits behind the one in flight. */
  setVolume(level: number): void {
    if (!Number.isFinite(level)) return;
    this.holdUntil = Date.now() + VOLUME_HOLD_MS;
    this.volumePending = Math.min(1, Math.max(0, level));
    this.flushVolume();
  }

  toggleShuffle(): void {
    // No shuffle control in the v1 contract (THEME_CONTRACT.md "Not in v1"), so nothing calls this yet.
  }

  setRepeat(_mode: RepeatMode): void {
    // Same as toggleShuffle().
  }

  /** The lyrics button (S6): Rust brings Spotify's own window forward. */
  showLyrics(): void {
    this.send("spotify_show_window");
  }

  private flushVolume(): void {
    if (this.volumeInFlight || this.volumePending === null) return;
    const level = this.volumePending;
    this.volumePending = null;
    this.volumeInFlight = true;
    invoke<boolean>("spotify_set_volume", { level })
      .catch((e) => console.error("spotify_set_volume failed", e))
      .finally(() => {
        this.volumeInFlight = false;
        this.flushVolume();
      });
  }

  private takeVolume(volume: SpotifyVolume | null, from: "pull" | "event"): void {
    const wait = this.holdUntil - Date.now();
    if (wait > 0 && volume) {
      this.held = { volume, from };
      window.clearTimeout(this.holdTimer);
      this.holdTimer = window.setTimeout(() => {
        const held = this.held;
        this.held = null;
        if (held) this.takeVolume(held.volume, held.from);
      }, wait);
      return;
    }
    const next = this.feed.acceptVolume(volume, from);
    if (next) this.onUpdate?.(next);
  }

  private send(cmd: string, args?: Record<string, unknown>): void {
    // The new state arrives as an event; a false answer (no session, Spotify refused) changes nothing.
    invoke<boolean>(cmd, args).catch((e) => console.error(`${cmd} failed`, e));
  }
}
