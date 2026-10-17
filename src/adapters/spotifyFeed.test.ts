import { describe, expect, it } from "vitest";
import { IDLE_NOW_PLAYING } from "../types/player";
import { NOT_RUNNING, SpotifyFeed, toNowPlaying, type SpotifyState } from "./spotifyFeed";

const ART_A = "data:image/png;base64,AAAA";
const ART_B = "data:image/jpeg;base64,BBBB";

function state(over: Partial<SpotifyState>): SpotifyState {
  return {
    seq: 1,
    session: true,
    status: "playing",
    title: "t",
    artist: "a",
    album: "al",
    artworkId: 0,
    artwork: null,
    positionMs: 1000,
    durationMs: 200_000,
    positionUpdatedAt: 5000,
    canSeek: true,
    ...over,
  };
}

describe("toNowPlaying", () => {
  it("maps a playing session to a Spotify track with its timeline and capabilities", () => {
    expect(toNowPlaying(state({}), ART_A)).toEqual({
      source: "spotify",
      status: "playing",
      track: { title: "t", artist: "a", album: "al", artwork: ART_A, durationMs: 200_000 },
      positionMs: 1000,
      positionUpdatedAt: 5000,
      caps: { seek: true, volume: false, shuffle: false, repeat: false, album: true, lyrics: true },
    });
    expect(toNowPlaying(state({ status: "paused", canSeek: false }), undefined)).toMatchObject({
      status: "paused",
      caps: { seek: false },
    });
  });

  it("no session is 'not running' (unavailable, no track); a stopped session or nothing loaded is idle", () => {
    expect(toNowPlaying(state({ session: false }), ART_A)).toBe(NOT_RUNNING);
    expect(NOT_RUNNING).toMatchObject({ source: "spotify", status: "unavailable" });
    expect(NOT_RUNNING.track).toBeUndefined();
    expect(toNowPlaying(state({ status: "idle" }), ART_A)).toBe(IDLE_NOW_PLAYING);
    expect(toNowPlaying(state({ title: "" }), ART_A)).toBe(IDLE_NOW_PLAYING);
  });

  it("leaves out an empty album, an unknown duration and a negative position", () => {
    const np = toNowPlaying(state({ album: "", durationMs: 0, positionMs: -5 }), undefined);
    expect(np.track!.album).toBeUndefined();
    expect(np.track!.durationMs).toBeUndefined();
    expect(np.track!.artwork).toBeUndefined();
    expect(np.positionMs).toBe(0);
  });
});

describe("SpotifyFeed", () => {
  it("ignores nothing, garbage and states older than the newest seen (a slow pull after an event)", () => {
    const feed = new SpotifyFeed();
    expect(feed.accept(null)).toBeNull();
    expect(feed.accept({} as SpotifyState)).toBeNull();
    expect(feed.accept(state({ seq: 5, title: "new" }))!.track!.title).toBe("new");
    expect(feed.accept(state({ seq: 4, title: "old" }))).toBeNull();
    expect(feed.accept(state({ seq: 5, title: "same seq" }))).toBeNull();
    expect(feed.accept(state({ seq: 6, title: "newer" }))!.track!.title).toBe("newer");
  });

  it("keeps the artwork that later events leave out, and drops it when the id changes", () => {
    const feed = new SpotifyFeed();
    expect(feed.accept(state({ seq: 1, artworkId: 7, artwork: ART_A }))!.track!.artwork).toBe(ART_A);
    // Position/status events for the same image carry no artwork.
    expect(feed.accept(state({ seq: 2, artworkId: 7, artwork: null, status: "paused" }))!.track!.artwork).toBe(ART_A);
    // A new track with a new image.
    expect(feed.accept(state({ seq: 3, artworkId: 8, artwork: ART_B }))!.track!.artwork).toBe(ART_B);
    // A track without artwork.
    expect(feed.accept(state({ seq: 4, artworkId: 0, artwork: null }))!.track!.artwork).toBeUndefined();
  });

  it("an older pull still delivers the artwork of the image showing now", () => {
    const feed = new SpotifyFeed();
    // Rust sent image 7 before the frontend listened, so the first event it sees omits it.
    expect(feed.accept(state({ seq: 11, artworkId: 7, artwork: null }))!.track!.artwork).toBeUndefined();
    // The pull (always with artwork) arrives late; it is stale, but its image is the current one.
    const np = feed.accept(state({ seq: 10, artworkId: 7, artwork: ART_A, title: "stale" }));
    expect(np!.track!.artwork).toBe(ART_A);
    expect(np!.track!.title).toBe("t");
    // ...and an older pull with a different image changes nothing.
    expect(feed.accept(state({ seq: 9, artworkId: 6, artwork: ART_B }))).toBeNull();
  });

  it("reset() forgets ordering and artwork (a reconnect starts fresh)", () => {
    const feed = new SpotifyFeed();
    feed.accept(state({ seq: 9, artworkId: 7, artwork: ART_A }));
    feed.reset();
    const np = feed.accept(state({ seq: 2, artworkId: 7, artwork: null }));
    expect(np!.track!.artwork).toBeUndefined();
  });
});

describe("SpotifyFeed volume (S5)", () => {
  it("turns the volume capability on with Spotify's level, once there is a track", () => {
    const feed = new SpotifyFeed();
    expect(feed.acceptVolume({ available: true, level: 0.4 }, "pull"), "no state yet: nothing to show").toBeNull();
    const np = feed.accept(state({ seq: 1 }))!;
    expect(np.caps.volume).toBe(true);
    expect(np.volume).toBe(0.4);
    const changed = feed.acceptVolume({ available: true, level: 0.7 }, "event")!;
    expect(changed.volume).toBe(0.7);
    expect(changed.track!.title).toBe("t");
  });

  it("no audio session: no volume capability and no level", () => {
    const feed = new SpotifyFeed();
    feed.accept(state({ seq: 1 }));
    const np = feed.acceptVolume({ available: false, level: 0 }, "event")!;
    expect(np.caps.volume).toBe(false);
    expect(np.volume).toBeUndefined();
  });

  it("a pull answered after an event is stale; garbage is ignored; reset forgets", () => {
    const feed = new SpotifyFeed();
    feed.accept(state({ seq: 1 }));
    feed.acceptVolume({ available: true, level: 0.9 }, "event");
    expect(feed.acceptVolume({ available: true, level: 0.2 }, "pull")).toBeNull();
    expect(feed.acceptVolume({ available: true, level: Number.NaN }, "event")).toBeNull();
    expect(feed.acceptVolume(null, "event")).toBeNull();
    feed.reset();
    feed.accept(state({ seq: 1 }));
    expect(feed.acceptVolume({ available: true, level: 0.2 }, "pull")!.volume).toBe(0.2);
  });
});

describe("lyrics capability (S6)", () => {
  it("a Spotify track can always bring Spotify forward; idle and not-running show no button", () => {
    expect(toNowPlaying(state({}), undefined).caps.lyrics).toBe(true);
    expect(toNowPlaying(state({ status: "idle" }), undefined).caps.lyrics).toBe(false);
    expect(toNowPlaying(state({ session: false }), undefined).caps.lyrics).toBe(false);
  });
});
