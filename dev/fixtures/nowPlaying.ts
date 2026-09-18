import type { NowPlaying } from "../../src/types/player";

// Dev-only fixture data (docs/PLAN.md §4 "Fixtures"; CLAUDE.md: "Never generate
// displayed text... Fixtures live only in /dev/fixtures... obviously synthetic...
// excluded from production builds"). Every string below carries the
// FIXTURE-ONLY-DEV-BUILD marker so a production build can be checked for leakage
// (see scripts/check-fixtures-excluded.mjs).
const MARK = "FIXTURE-ONLY-DEV-BUILD";

const FULL_CAPS = { seek: true, volume: true, shuffle: true, repeat: true, album: true };
const NO_CAPS = { seek: false, volume: false, shuffle: false, repeat: false, album: false };

function base(overrides: Partial<NowPlaying>): NowPlaying {
  return {
    source: "spotify",
    status: "playing",
    positionMs: 42_000,
    positionUpdatedAt: Date.now(),
    caps: FULL_CAPS,
    track: {
      title: `${MARK} Track Title`,
      artist: `${MARK} Artist Name`,
      album: `${MARK} Album Name`,
      durationMs: 210_000,
    },
    ...overrides,
  };
}

export const fixtures: Record<string, NowPlaying> = {
  "typical / all caps": base({}),

  "long title + artist (overflow test)": base({
    track: {
      title: `${MARK} A Track Title So Long It Should Overflow Any Reasonable Fixed-Width Player Layout, Testing Truncation`,
      artist: `${MARK} An Artist Name That Is Also Unreasonably Long For A Mini Player Pill`,
      album: `${MARK} Album`,
      durationMs: 210_000,
    },
  }),

  "CJK / accented characters": base({
    track: {
      title: `${MARK} 夜に駆ける —élève`,
      artist: `${MARK} Élodie Özdemir 李雷`,
      album: `${MARK} アルバム`,
      durationMs: 180_000,
    },
  }),

  "no artwork, no album": base({
    track: {
      title: `${MARK} No Artwork Track`,
      artist: `${MARK} No Artwork Artist`,
      durationMs: 150_000,
    },
  }),

  paused: base({ status: "paused" }),

  idle: {
    source: "spotify",
    status: "idle",
    positionMs: 0,
    positionUpdatedAt: Date.now(),
    caps: NO_CAPS,
  },

  error: {
    source: "spotify",
    status: "error",
    positionMs: 0,
    positionUpdatedAt: Date.now(),
    caps: NO_CAPS,
    error: { code: "FIXTURE_ERROR", detail: `${MARK} Spotify not running` },
  },

  "no capabilities (GSMTC-style: no volume)": base({ caps: NO_CAPS }),

  "seek only": base({ caps: { ...NO_CAPS, seek: true } }),
};
