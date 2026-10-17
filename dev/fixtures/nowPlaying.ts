import type { NowPlaying } from "../../src/types/player";

// Dev-only fixture data (docs/PLAN.md §4 "Fixtures"; CLAUDE.md: "Never generate
// displayed text... Fixtures live only in /dev/fixtures... obviously synthetic...
// excluded from production builds"). Every string below carries the
// FIXTURE-ONLY-DEV-BUILD marker so a production build can be checked for leakage
// (see scripts/check-fixtures-excluded.mjs).
const MARK = "FIXTURE-ONLY-DEV-BUILD";

const FULL_CAPS = { seek: true, volume: true, shuffle: true, repeat: true, album: true, lyrics: true };
const NO_CAPS = { seek: false, volume: false, shuffle: false, repeat: false, album: false, lyrics: false };

// Flat-colour synthetic artwork for the very-light / very-dark rows of the matrix.
function flatArtwork(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><!-- ${MARK} --><rect width="64" height="64" fill="${color}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Synthetic multi-colour artwork so palette-driven treatments (duotone/dither) have something to show.
function colorfulArtwork(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><!-- ${MARK} --><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8b93a"/><stop offset="0.5" stop-color="#d1495b"/><stop offset="1" stop-color="#2e4a9a"/></linearGradient></defs><rect width="128" height="128" fill="url(#g)"/><circle cx="40" cy="42" r="22" fill="#f4f1de"/><circle cx="92" cy="88" r="30" fill="#1b1f3b"/><rect x="60" y="14" width="10" height="100" fill="#6fd08c"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

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

  "emoji title (split-flap falls back to plain text)": base({
    track: { title: `${MARK} Party 🎉`, artist: `${MARK} Artist Name`, album: `${MARK} Album Name`, durationMs: 210_000 },
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

  // No Spotify session (M1 R2): the empty-state part with the "Spotify not running" copy. No text of its own.
  "Spotify not running (unavailable, no track)": {
    source: "spotify",
    status: "unavailable",
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

  "no seek": base({ caps: { ...FULL_CAPS, seek: false } }),
  "no volume": base({ caps: { ...FULL_CAPS, volume: false } }),
  "no shuffle": base({ caps: { ...FULL_CAPS, shuffle: false } }),
  "no repeat": base({ caps: { ...FULL_CAPS, repeat: false } }),
  "no lyrics": base({ caps: { ...FULL_CAPS, lyrics: false } }),
  "with link-out (permalink)": base({
    track: { ...base({}).track!, permalink: `https://example.invalid/${MARK}` },
  }),

  "no album cap": base({ caps: { ...FULL_CAPS, album: false } }),

  "colorful artwork (filter test)": base({ track: { ...base({}).track!, artwork: colorfulArtwork() } }),
  "very light artwork": base({ track: { ...base({}).track!, artwork: flatArtwork("#fafafa") } }),
  "very dark artwork": base({ track: { ...base({}).track!, artwork: flatArtwork("#050505") } }),
};
