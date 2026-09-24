import { forwardRef, useMemo } from "react";
import { waveformPeaks } from "./beat";

const BARS = 48;

function barsPath(peaks: number[]): string {
  return peaks.map((h, i) => `M${i + 0.2} ${(1 - h) / 2}h0.6v${h}h-0.6z`).join("");
}

/**
 * Decorative, seeded waveform strip (`.mp-waveform`). Two stacked SVGs share one path: a muted
 * base and an accent "played" layer clipped to `--mp-progress`. The shape is a fixed pseudo-random
 * profile of the track, NOT an analysis of its audio (see beat.ts); only a tiny vertical shimmer
 * follows the simulated `--mp-beat`. Purely presentational, so `aria-hidden`.
 */
export const Waveform = forwardRef<HTMLDivElement, { title: string; artist: string }>(function Waveform(
  { title, artist },
  ref,
) {
  const d = useMemo(() => barsPath(waveformPeaks(title, artist, BARS)), [title, artist]);
  const svgProps = { viewBox: `0 0 ${BARS} 1`, preserveAspectRatio: "none", "aria-hidden": true, focusable: false } as const;
  return (
    <div className="mp-waveform" ref={ref} aria-hidden="true">
      <svg className="mp-wave-base" {...svgProps}>
        <path d={d} />
      </svg>
      <svg className="mp-wave-fill" {...svgProps}>
        <path d={d} />
      </svg>
    </div>
  );
});
