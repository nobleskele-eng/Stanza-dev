import { describe, expect, it } from "vitest";
import { NO_CAPS, type NowPlaying } from "../types/player";
import { SEEK_STEP_MS, seekTargetForKey, type SeekKey } from "./seekKeys";

const key = (k: string, over: Partial<SeekKey> = {}): SeekKey => ({
  key: k,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  inField: false,
  ...over,
});

const track = (over: Partial<NowPlaying> = {}): NowPlaying => ({
  source: "spotify",
  status: "playing",
  track: { title: "t", artist: "a", durationMs: 60_000 },
  positionMs: 0,
  positionUpdatedAt: 0,
  caps: { ...NO_CAPS, seek: true },
  ...over,
});

describe("seekTargetForKey", () => {
  it("right/left move one step forward/back from the current position", () => {
    expect(seekTargetForKey(key("ArrowRight"), track(), 20_000)).toBe(20_000 + SEEK_STEP_MS);
    expect(seekTargetForKey(key("ArrowLeft"), track(), 20_000)).toBe(20_000 - SEEK_STEP_MS);
    expect(seekTargetForKey(key("ArrowRight"), track({ status: "paused" }), 0)).toBe(SEEK_STEP_MS);
  });

  it("stops at the start and at the end of the track", () => {
    expect(seekTargetForKey(key("ArrowLeft"), track(), 3_000)).toBe(0);
    expect(seekTargetForKey(key("ArrowRight"), track(), 58_000)).toBe(60_000);
  });

  it("ignores other keys, modified arrows and arrows a field uses itself (the volume slider)", () => {
    for (const k of ["ArrowUp", "ArrowDown", " ", "Enter", "l"]) expect(seekTargetForKey(key(k), track(), 0), k).toBeNull();
    for (const m of ["ctrlKey", "altKey", "metaKey", "inField"] as const)
      expect(seekTargetForKey(key("ArrowRight", { [m]: true }), track(), 0), m).toBeNull();
  });

  it("does nothing without a seekable track", () => {
    expect(seekTargetForKey(key("ArrowRight"), track({ caps: NO_CAPS }), 0)).toBeNull();
    expect(seekTargetForKey(key("ArrowRight"), track({ track: undefined }), 0)).toBeNull();
    for (const status of ["idle", "unavailable", "error"] as const)
      expect(seekTargetForKey(key("ArrowRight"), track({ status }), 0), status).toBeNull();
  });
});
