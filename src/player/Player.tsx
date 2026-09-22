import { useEffect, useState, type CSSProperties } from "react";
import { copy } from "../copy";
import { extractPaletteFromUrl, type ArtPalette } from "../theme/palette";
import type { NowPlaying } from "../types/player";
import { formatMs, progressFraction } from "./format";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from "./icons";

export type Layout = "pill" | "card" | "strip";
export type Platform = "windows" | "macos";

interface PlayerProps {
  nowPlaying: NowPlaying;
  positionMs: number;
  layout: Layout;
  platform: Platform;
  onPlayPause?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
}

/**
 * Contract-compliant DOM (docs/THEME_CONTRACT.md). This is the ONE structure every
 * theme styles — `data-layout` picks pill/card/strip via CSS grid-template-areas,
 * not a different component tree, so a theme can rearrange parts without the app
 * needing three separate implementations to keep in sync.
 */
export function Player({
  nowPlaying,
  positionMs,
  layout,
  platform,
  onPlayPause,
  onNext,
  onPrevious,
}: PlayerProps) {
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

  const rootStyle = {
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
      data-source={source}
      data-status={status}
      data-platform={platform}
      data-cap-seek={caps.seek || undefined}
      data-cap-volume={caps.volume || undefined}
      data-cap-shuffle={caps.shuffle || undefined}
      data-cap-repeat={caps.repeat || undefined}
      data-cap-album={caps.album || undefined}
      data-hover={hover || undefined}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={rootStyle}
    >
      <div className="mp-window">
        {status === "idle" && <div className="mp-empty">{copy("idle")}</div>}

        {status === "error" && (
          <div className="mp-error">{error?.detail ?? copy("errorFallback")}</div>
        )}

        {hasTrack && track && (
          <>
            {track.artwork ? (
              <img className="mp-artwork" src={track.artwork} alt="" />
            ) : (
              <div className="mp-artwork" aria-hidden="true" />
            )}

            {/* key remounts on track change so themes can retrigger a CSS
                animation (e.g. T1's line-in) purely by transition/animation —
                no JS-driven timing needed. */}
            <div className="mp-meta" key={`${track.title}::${track.artist}`}>
              <div className="mp-title">{track.title}</div>
              <div className="mp-artist">{track.artist}</div>
              {caps.album && track.album && <div className="mp-album">{track.album}</div>}
            </div>

            <div className="mp-progress">
              <div className="mp-progress-fill" />
            </div>
            <div className="mp-time-current">{formatMs(positionMs)}</div>
            <div className="mp-time-total">{formatMs(track.durationMs ?? 0)}</div>

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
                <input className="mp-volume" type="range" min={0} max={1} step={0.01} aria-label={copy("volume")} />
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
