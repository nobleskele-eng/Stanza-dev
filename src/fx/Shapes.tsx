import { forwardRef } from "react";

/**
 * Decorative shape layer (`.mp-shapes`): a few SVG shapes that drift and rotate slowly, with a
 * slight scale pulse from the simulated `--mp-beat` (beat.ts — not real audio). Sits behind every
 * other part, never receives pointer events, clipped to the window's own box. `aria-hidden`.
 * Motion and colour live in fx.css so themes can restyle; this only supplies structure.
 */
export const Shapes = forwardRef<SVGSVGElement>(function Shapes(_props, ref) {
  return (
    <svg
      className="mp-shapes"
      ref={ref}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable={false}
    >
      <g className="mp-shape mp-shape-a" style={{ ["--k" as string]: 1 }}>
        <circle cx="18" cy="20" r="14" />
      </g>
      <g className="mp-shape mp-shape-b" style={{ ["--k" as string]: 0.6 }}>
        <circle cx="84" cy="34" r="11" className="mp-shape-ring" />
      </g>
      <g className="mp-shape mp-shape-c" style={{ ["--k" as string]: 0.8 }}>
        <rect x="70" y="72" width="16" height="16" rx="3" />
      </g>
      <g className="mp-shape mp-shape-d" style={{ ["--k" as string]: 0.5 }}>
        <path d="M14 78 L28 78 L21 90 Z" />
      </g>
    </svg>
  );
});
