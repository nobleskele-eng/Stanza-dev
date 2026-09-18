import type { CSSProperties } from "react";
import type { NowPlaying } from "../types/player";
import { formatMs, progressFraction } from "./format";

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
  const progress = progressFraction(positionMs, track?.durationMs);
  const hasTrack = (status === "playing" || status === "paused" || status === "unavailable") && track;

  const rootStyle = {
    "--mp-progress": progress,
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
      style={rootStyle}
    >
      <div className="mp-window">
        {status === "idle" && <div className="mp-empty">Nothing playing</div>}

        {status === "error" && (
          <div className="mp-error">{error?.detail ?? "Something went wrong"}</div>
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
              <button className="mp-btn-prev" type="button" aria-label="Previous" onClick={onPrevious}>
                ⏮
              </button>
              <button
                className="mp-btn-play"
                type="button"
                aria-label={status === "playing" ? "Pause" : "Play"}
                onClick={onPlayPause}
              >
                {status === "playing" ? "⏸" : "⏵"}
              </button>
              <button className="mp-btn-next" type="button" aria-label="Next" onClick={onNext}>
                ⏭
              </button>
            </div>

            {caps.volume && (
              <div className="mp-volume-wrap">
                <input className="mp-volume" type="range" min={0} max={1} step={0.01} aria-label="Volume" />
              </div>
            )}

            {track.permalink && (
              <a className="mp-link-out" href={track.permalink} target="_blank" rel="noreferrer">
                Open
              </a>
            )}
          </>
        )}

        <div className="mp-source-badge">{source.toUpperCase()}</div>
      </div>
    </div>
  );
}
