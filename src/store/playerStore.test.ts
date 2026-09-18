import { describe, expect, it, vi } from "vitest";
import type { PlayerAdapter } from "../adapters/types";
import { IDLE_NOW_PLAYING, NO_CAPS, type NowPlaying } from "../types/player";
import { PlayerStore, interpolatePositionMs } from "./playerStore";

function playingAt(positionMs: number, positionUpdatedAt: number, durationMs?: number): NowPlaying {
  return {
    source: "spotify",
    status: "playing",
    track: { title: "t", artist: "a", durationMs },
    positionMs,
    positionUpdatedAt,
    caps: NO_CAPS,
  };
}

describe("interpolatePositionMs", () => {
  it("returns the raw position when not playing (C10 only interpolates while playing)", () => {
    const paused: NowPlaying = { ...playingAt(5000, 1000), status: "paused" };
    expect(interpolatePositionMs(paused, 10_000)).toBe(5000);
  });

  it("advances position by elapsed time since positionUpdatedAt", () => {
    const np = playingAt(5000, 1000);
    expect(interpolatePositionMs(np, 1000)).toBe(5000);
    expect(interpolatePositionMs(np, 3500)).toBe(7500);
  });

  it("never goes backwards if `atMs` is before positionUpdatedAt (clock skew)", () => {
    const np = playingAt(5000, 10_000);
    expect(interpolatePositionMs(np, 9000)).toBe(5000);
  });

  it("clamps to track duration instead of overshooting past the end", () => {
    const np = playingAt(9000, 1000, 10_000);
    expect(interpolatePositionMs(np, 5000)).toBe(10_000);
  });
});

function makeAdapter(source: "spotify" | "soundcloud") {
  let update: ((np: NowPlaying) => void) | null = null;
  const adapter: PlayerAdapter = {
    source,
    connect: vi.fn((onUpdate) => {
      update = onUpdate;
      onUpdate({ ...IDLE_NOW_PLAYING, source, status: "playing" });
    }),
    disconnect: vi.fn(() => {
      update = null;
    }),
    playPause: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    toggleShuffle: vi.fn(),
    setRepeat: vi.fn(),
  };
  return {
    adapter,
    // Simulates the adapter pushing an update — including a stale one after disconnect.
    push: (np: NowPlaying) => update?.(np),
  };
}

describe("PlayerStore source switching (D9: one source at a time)", () => {
  it("connects the requested adapter and updates the snapshot", () => {
    const store = new PlayerStore();
    const { adapter } = makeAdapter("spotify");
    store.registerAdapter(adapter);

    store.switchSource("spotify");

    expect(adapter.connect).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().source).toBe("spotify");
    expect(store.getSnapshot().status).toBe("playing");
  });

  it("disconnects the previous adapter before connecting the next", () => {
    const store = new PlayerStore();
    const spotify = makeAdapter("spotify");
    const soundcloud = makeAdapter("soundcloud");
    store.registerAdapter(spotify.adapter);
    store.registerAdapter(soundcloud.adapter);

    store.switchSource("spotify");
    store.switchSource("soundcloud");

    expect(spotify.adapter.disconnect).toHaveBeenCalledTimes(1);
    expect(soundcloud.adapter.connect).toHaveBeenCalledTimes(1);
    expect(store.getActiveSource()).toBe("soundcloud");
  });

  it("never applies a stale update from a disconnected adapter (never hear both at once)", () => {
    const store = new PlayerStore();
    const spotify = makeAdapter("spotify");
    const soundcloud = makeAdapter("soundcloud");
    store.registerAdapter(spotify.adapter);
    store.registerAdapter(soundcloud.adapter);

    store.switchSource("spotify");
    store.switchSource("soundcloud");

    // spotify's adapter fires late, after being told to disconnect.
    spotify.push({ ...IDLE_NOW_PLAYING, source: "spotify", status: "playing" });

    expect(store.getSnapshot().source).toBe("soundcloud");
  });

  it("notifies subscribers only for updates from the active source", () => {
    const store = new PlayerStore();
    const spotify = makeAdapter("spotify");
    store.registerAdapter(spotify.adapter);

    const seen: NowPlaying[] = [];
    store.subscribe((np) => seen.push(np));

    store.switchSource("spotify");
    spotify.push({ ...IDLE_NOW_PLAYING, source: "spotify", status: "paused" });

    expect(seen.map((np) => np.status)).toEqual(["playing", "paused"]);
  });

  it("switching to the already-active source is a no-op", () => {
    const store = new PlayerStore();
    const { adapter } = makeAdapter("spotify");
    store.registerAdapter(adapter);

    store.switchSource("spotify");
    store.switchSource("spotify");

    expect(adapter.connect).toHaveBeenCalledTimes(1);
  });

  it("throws for an unregistered source instead of silently doing nothing", () => {
    const store = new PlayerStore();
    expect(() => store.switchSource("soundcloud")).toThrow(/soundcloud/);
  });
});
