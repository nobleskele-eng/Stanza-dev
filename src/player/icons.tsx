// Transport icons as inline SVG (docs/PLAN.md §0: control icons are SVG/CSS, never
// font glyphs — ⏮ ⏸ ⏭ render as colour emoji in WebKit). Sized in em and filled with
// currentColor so a theme restyles them with `color` + `font-size` alone.

const svgProps = {
  viewBox: "0 0 16 16",
  width: "1em",
  height: "1em",
  fill: "currentColor",
  "aria-hidden": true,
  focusable: false,
} as const;

export const PrevIcon = () => (
  <svg {...svgProps}>
    <rect x="2" y="2.5" width="2" height="11" />
    <path d="M14 2.5v11L5.5 8z" />
  </svg>
);

export const NextIcon = () => (
  <svg {...svgProps}>
    <rect x="12" y="2.5" width="2" height="11" />
    <path d="M2 2.5v11L10.5 8z" />
  </svg>
);

export const PlayIcon = () => (
  <svg {...svgProps}>
    <path d="M4 2v12l10-6z" />
  </svg>
);

export const PauseIcon = () => (
  <svg {...svgProps}>
    <rect x="3.5" y="2.5" width="3.5" height="11" />
    <rect x="9" y="2.5" width="3.5" height="11" />
  </svg>
);
