import { useEffect, useRef, useState, type CSSProperties } from "react";
import { copy } from "../copy";
import { AnimatedText, FxFilters, type TextFx } from "../fx/AnimatedText";
import { Debris } from "../fx/Debris";
import { Flow } from "../fx/Flow";
import { Shapes } from "../fx/Shapes";
import { useBeat } from "../fx/useBeat";
import { useTrackTransition } from "../fx/useTrackTransition";
import { Waveform } from "../fx/Waveform";
import { extractPaletteFromUrl, type ArtPalette } from "../theme/palette";
import type { NowPlaying } from "../types/player";
import { formatMs, progressFraction } from "./format";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from "./icons";

export type Layout = "pill" | "card" | "strip";
export type Platform = "windows" | "macos";

/** Opt-in effect layers (customizer / dev harness). All off by default. The beat behind them is
 * simulated, not audio analysis — see src/fx/beat.ts. */
export interface FxSettings {
  shapes?: boolean;
  waveform?: boolean;
  /** Decorative real-text backdrop the theme flows around its shapes (theme must style it). */
  flow?: boolean;
  /** Animate track changes with the browser's View Transitions (theme styles the transition). */
  morph?: boolean;
  /** The previous title's letters spill out as physics debris on track change (decorative, ~2.8 s). */
  debris?: boolean;
  title?: TextFx;
  artist?: TextFx;
}

interface PlayerProps {
  nowPlaying: NowPlaying;
  positionMs: number;
  layout: Layout;
  /** Active theme id (contract v2, DECISIONS.md 2026-09-22) — lets a theme scope its
   * CSS to itself via `[data-theme]`, needed once two themes can share one `layout`. */
  theme: string;
  /** Variant token overrides, applied as inline custom properties on `.mp-root` (PLAN.md §4). */
  overrides?: Record<string, string>;
  /** Variant-hidden parts, as `data-hide-<part>` attributes on `.mp-root`. */
  hidden?: readonly string[];
  platform: Platform;
  fx?: FxSettings;
  onPlayPause?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  /** The volume slider moved (0–1). Without it the slider shows the level but doesn't move. */
  onVolume?: (level: number) => void;
}

/**
 * Contract-compliant DOM (docs/THEME_CONTRACT.md). This is the ONE structure every
 * theme styles — `data-layout` picks pill/card/strip via CSS grid-template-areas,
 * not a different component tree, so a theme can rearrange parts without the app
 * needing three separate implementations to keep in sync.
 */
export function Player({
  nowPlaying: nowPlayingProp,
  positionMs: positionMsProp,
  layout,
  theme,
  overrides,
  hidden,
  platform,
  fx,
  onPlayPause,
  onNext,
  onPrevious,
  onVolume,
}: PlayerProps) {
  // Track changes may be held back one frame so the browser can capture the old card first (morph).
  const { nowPlaying, positionMs } = useTrackTransition(
    { nowPlaying: nowPlayingProp, positionMs: positionMsProp },
    nowPlayingProp.track ? `${nowPlayingProp.track.title}::${nowPlayingProp.track.artist}` : "",
    Boolean(fx?.morph),
  );
  const { source, status, track, caps, error } = nowPlaying;
  // data-hover = pointer is over the player (contract). Keyboard users get no data-hover, so a
  // theme that reveals controls on hover must also reveal them on :focus-within.
  const [hover, setHover] = useState(false);
  const progress = progressFraction(positionMs, track?.durationMs);
  const hasTrack = (status === "playing" || status === "paused" || status === "unavailable") && track;

  // Client-side palette extraction (THEME_CONTRACT.md `--mp-art-*`; DECISIONS.md
  // 2026-09-22). Re-runs only when the artwork URL itself changes, not on every
  // position tick. `extractPaletteFromUrl` resolves to null on load failure or a
  // tainted (cross-origin, no CORS) canvas — themes already require a fallback for
  // when these vars are absent.
  const artworkUrl = track?.artwork;
  const [artPalette, setArtPalette] = useState<ArtPalette | null>(null);
  useEffect(() => {
    if (!artworkUrl) {
      setArtPalette(null);
      return;
    }
    let cancelled = false;
    setArtPalette(null); // clear the previous track's colors rather than flash them on the new one
    extractPaletteFromUrl(artworkUrl).then((p) => {
      if (!cancelled) setArtPalette(p);
    });
    return () => {
      cancelled = true;
    };
  }, [artworkUrl]);

  const shapesRef = useRef<SVGSVGElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  useBeat(
    [shapesRef, waveformRef],
    Boolean((fx?.shapes || fx?.waveform) && status === "playing" && track),
    track?.title ?? "",
    track?.artist ?? "",
  );

  const rootStyle = {
    ...overrides,
    "--mp-progress": progress,
    ...(artPalette && {
      "--mp-art-1": artPalette.art1,
      "--mp-art-2": artPalette.art2,
      "--mp-art-3": artPalette.art3,
      "--mp-art-fg": artPalette.artFg,
    }),
  } as CSSProperties;

  return (
    <div
      className="mp-root"
      data-layout={layout}
      data-theme={theme}
      data-source={source}
      data-status={status}
      data-platform={platform}
      data-cap-seek={caps.seek || undefined}
      data-cap-volume={caps.volume || undefined}
      data-cap-shuffle={caps.shuffle || undefined}
      data-cap-repeat={caps.repeat || undefined}
      data-cap-album={caps.album || undefined}
      data-title={hasTrack && track ? track.title : undefined}
      data-artist={hasTrack && track ? track.artist : undefined}
      data-fx-shapes={fx?.shapes || undefined}
      data-fx-waveform={fx?.waveform || undefined}
      data-fx-flow={fx?.flow || undefined}
      data-fx-morph={fx?.morph || undefined}
      data-fx-debris={fx?.debris || undefined}
      data-fx-title={fx?.title}
      data-fx-artist={fx?.artist}
      {...Object.fromEntries((hidden ?? []).map((p) => [`data-hide-${p}`, true]))}
      data-hover={hover || undefined}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={rootStyle}
    >
      {/* Outside .mp-window: not a grid item, so it never needs a grid-area. */}
      <FxFilters palette={artPalette} />
      <div className="mp-window">
        {status === "idle" && <div className="mp-empty">{copy("idle")}</div>}
        {/* No session to read (Spotify not running): the same empty-state part, its own copy. */}
        {status === "unavailable" && !track && <div className="mp-empty">{copy("notRunning")}</div>}

        {status === "error" && (
          <div className="mp-error">{error?.detail ?? copy("errorFallback")}</div>
        )}

        {fx?.debris && <Debris title={hasTrack && track ? track.title : ""} enabled={Boolean(fx?.debris)} />}

        {hasTrack && track && fx?.flow && <Flow title={track.title} artist={track.artist} album={caps.album ? track.album : undefined} />}

        {hasTrack && track && fx?.shapes && <Shapes ref={shapesRef} />}

        {hasTrack && track && (
          <>
            {/* Same key-remount trick as .mp-meta below, so a theme's own artwork
                animation (e.g. T1's iris-wipe reveal, now that D10 permits
                animating .mp-artwork) replays per track too — .mp-artwork is a
                sibling of .mp-meta, not a child, so it needs its own key. */}
            {track.artwork ? (
              <img className="mp-artwork" src={track.artwork} alt="" key={`artwork::${track.title}::${track.artist}`} />
            ) : (
              <div className="mp-artwork" aria-hidden="true" key={`artwork::${track.title}::${track.artist}`} />
            )}

            {/* key remounts on track change so themes can retrigger a CSS
                animation (e.g. T1's line-in) purely by transition/animation —
                no JS-driven timing needed. */}
            <div className="mp-meta" key={`${track.title}::${track.artist}`}>
              <AnimatedText className="mp-title" text={track.title} effect={fx?.title} />
              <AnimatedText className="mp-artist" text={track.artist} effect={fx?.artist} />
              {caps.album && track.album && <div className="mp-album">{track.album}</div>}
            </div>

            <div className="mp-progress">
              <div className="mp-progress-fill" />
            </div>
            <div className="mp-time-current">{formatMs(positionMs)}</div>
            <div className="mp-time-total">{formatMs(track.durationMs ?? 0)}</div>
            {fx?.waveform && <Waveform ref={waveformRef} title={track.title} artist={track.artist} />}

            <div className="mp-controls">
              <button className="mp-btn-prev" type="button" aria-label={copy("previous")} onClick={onPrevious}>
                <PrevIcon />
              </button>
              <button
                className="mp-btn-play"
                type="button"
                aria-label={status === "playing" ? copy("pause") : copy("play")}
                onClick={onPlayPause}
              >
                {status === "playing" ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button className="mp-btn-next" type="button" aria-label={copy("next")} onClick={onNext}>
                <NextIcon />
              </button>
            </div>

            {caps.volume && (
              <div className="mp-volume-wrap">
                {/* Controlled by the source's level; a source with no level yet (fixtures) shows the
                    middle, where an uncontrolled range input used to sit. */}
                <input
                  className="mp-volume"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  aria-label={copy("volume")}
                  value={nowPlaying.volume ?? 0.5}
                  readOnly={!onVolume}
                  onChange={(e) => onVolume?.(Number(e.currentTarget.value))}
                />
              </div>
            )}

            {track.permalink && (
              <a className="mp-link-out" href={track.permalink} target="_blank" rel="noreferrer">
                {copy("linkOut")}
              </a>
            )}
          </>
        )}

        <div className="mp-source-badge">{copy("sourceBadge")}</div>
      </div>
    </div>
  );
}
