import type { PlayerAdapter } from "../adapters/types";
import { IDLE_NOW_PLAYING, type NowPlaying, type SourceId } from "../types/player";

/**
 * Interpolates playback position between GSMTC/adapter updates (C10 — position is
 * only current as of `positionUpdatedAt`; don't render it raw or the progress bar
 * freezes between events). Pure function so it's testable without timers.
 */
export function interpolatePositionMs(nowPlaying: NowPlaying, atMs: number): number {
  const { positionMs, positionUpdatedAt, status, track } = nowPlaying;
  if (status !== "playing") return positionMs;

  const elapsed = atMs - positionUpdatedAt;
  const interpolated = positionMs + Math.max(0, elapsed);

  if (track?.durationMs !== undefined) {
    return Math.min(interpolated, track.durationMs);
  }
  return interpolated;
}

type Unsubscribe = () => void;
type Listener = (nowPlaying: NowPlaying) => void;

/**
 * Single source of truth for the UI (docs/PLAN.md §3). Owns which adapter is
 * "active" and guarantees only one plays at a time (D9) — switching sources
 * disconnects the previous adapter before connecting the next, and updates from a
 * disconnected adapter are dropped even if it fires late.
 */
export class PlayerStore {
  private adapters = new Map<SourceId, PlayerAdapter>();
  private activeSourceId: SourceId | null = null;
  private snapshot: NowPlaying = IDLE_NOW_PLAYING;
  private listeners = new Set<Listener>();

  registerAdapter(adapter: PlayerAdapter): void {
    this.adapters.set(adapter.source, adapter);
  }

  getSnapshot(): NowPlaying {
    return this.snapshot;
  }

  getActiveSource(): SourceId | null {
    return this.activeSourceId;
  }

  subscribe(listener: Listener): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Switches the active source. Never leaves two adapters connected (D9). */
  switchSource(id: SourceId): void {
    if (id === this.activeSourceId) return;

    const previous = this.activeSourceId ? this.adapters.get(this.activeSourceId) : undefined;
    previous?.disconnect();

    const next = this.adapters.get(id);
    if (!next) {
      throw new Error(`No adapter registered for source "${id}"`);
    }

    this.activeSourceId = id;
    next.connect((nowPlaying) => this.handleAdapterUpdate(id, nowPlaying));
  }

  /** Disconnects the active adapter (e.g. when the UI unmounts). The snapshot goes back to idle. */
  stop(): void {
    const active = this.activeAdapter;
    this.activeSourceId = null;
    active?.disconnect();
    this.snapshot = IDLE_NOW_PLAYING;
    for (const listener of this.listeners) listener(this.snapshot);
  }

  private handleAdapterUpdate(sourceId: SourceId, nowPlaying: NowPlaying): void {
    // Guards against a disconnected adapter's callback firing after a switch —
    // the whole point of D9 is one audible source at a time.
    if (sourceId !== this.activeSourceId) return;
    this.snapshot = nowPlaying;
    for (const listener of this.listeners) listener(nowPlaying);
  }

  private get activeAdapter(): PlayerAdapter | undefined {
    return this.activeSourceId ? this.adapters.get(this.activeSourceId) : undefined;
  }

  playPause(): void {
    this.activeAdapter?.playPause();
  }

  next(): void {
    this.activeAdapter?.next();
  }

  previous(): void {
    this.activeAdapter?.previous();
  }

  /**
   * Seeks the active source, clamped to the track. The new position shows at once (optimistic),
   * so quick repeated seeks build on each other before the source confirms; the source's next
   * update replaces it either way.
   */
  seek(ms: number, now = Date.now()): void {
    const adapter = this.activeAdapter;
    if (!adapter) return;
    const { track } = this.snapshot;
    const target = Math.min(Math.max(0, ms), track?.durationMs ?? Infinity);
    adapter.seek(target);
    if (!track) return;
    this.snapshot = { ...this.snapshot, positionMs: target, positionUpdatedAt: now };
    for (const listener of this.listeners) listener(this.snapshot);
  }

  /** Sets the active source's volume (0–1, clamped), shown at once like a seek (optimistic). */
  setVolume(level: number): void {
    const adapter = this.activeAdapter;
    if (!adapter || !Number.isFinite(level)) return;
    const volume = Math.min(1, Math.max(0, level));
    adapter.setVolume(volume);
    if (!this.snapshot.caps.volume) return;
    this.snapshot = { ...this.snapshot, volume };
    for (const listener of this.listeners) listener(this.snapshot);
  }

  toggleShuffle(): void {
    this.activeAdapter?.toggleShuffle();
  }

  setRepeat(mode: Parameters<PlayerAdapter["setRepeat"]>[0]): void {
    this.activeAdapter?.setRepeat(mode);
  }

  showLyrics(): void {
    this.activeAdapter?.showLyrics();
  }
}
