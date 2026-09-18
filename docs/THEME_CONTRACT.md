# Stanza — Theme Contract

**Contract version: 1 (stub — finalized in Phase 3)**

This document is the source of truth for the class names, data attributes, and CSS
custom properties that a Stanza theme may rely on. Any change to markup structure,
attribute names, or variable names is a contract version bump, made in the same
change as the code that requires it.

See `docs/PLAN.md` Section 4 for the full package format (`theme.json`), rationale,
and the first-party theme roster (T1–T4). This file will be expanded into the full
v1 spec during Phase 3; today it only stubs the shape so early code has something
to target.

## Root
`.mp-root` carries:
- `data-layout` — `pill | card | strip`
- `data-source` — `spotify | soundcloud`
- `data-status` — `idle | playing | paused | unavailable | error`
- `data-cap-seek | data-cap-volume | data-cap-shuffle | data-cap-repeat | data-cap-album`
- `data-platform` — `windows | macos`
- `data-hover`

## App-provided variables (not theme-authored)
- `--mp-progress` (0–1)
- `--mp-art-1`, `--mp-art-2`, `--mp-art-3`
- `--mp-art-fg`

## Theme tokens (theme-authored)
`--mp-bg`, `--mp-fg`, `--mp-muted`, `--mp-accent`, `--mp-radius-window`,
`--mp-radius-control`, `--mp-font-display`, `--mp-font-body`, `--mp-shadow`,
`--mp-motion-fast`, `--mp-motion-slow`

## Layouts and controls (customizer, D14)
- `theme.json` gains `"layouts": [...]` and `"controls": { "<token>": { "type": "color|length|number|font", "min"?, "max"? } }`.
- Only tokens listed in `controls` are editable by the in-app customizer. App-provided variables (`--mp-progress`, `--mp-art-*`) are never editable, in any layer.

## Parts
`.mp-window`, `.mp-artwork`, `.mp-meta`, `.mp-title`, `.mp-artist`, `.mp-album`,
`.mp-progress`, `.mp-progress-fill`, `.mp-time-current`, `.mp-time-total`,
`.mp-controls`, `.mp-btn-prev`, `.mp-btn-play`, `.mp-btn-next`,
`.mp-volume-wrap`, `.mp-volume`, `.mp-source-badge` (required, must stay
visible), `.mp-link-out`, `.mp-empty`, `.mp-error`

`.mp-volume-wrap` exists only because a rotated `<input type="range">` needs a
non-rotated ancestor to reserve its final on-screen footprint in the grid
(`transform` doesn't affect layout size) — grid placement and `data-hide-volume`
target the wrapper; `.mp-volume` itself is theme-styled freely inside it.

- `data-hide-<part>` on `.mp-root` hides the named part. `.mp-source-badge` is never hideable. Artwork radius/appearance is never exposed to any customization layer.
- Parts are direct children of the layout grid, so themes can rearrange them with `grid-template-areas`.

## Snippets
User CSS snippets may target any contract class, data attribute, or CSS custom
property listed in this document, and are subject to the same rules as themes
(see Rules, below) — including the guard-layer protections on `.mp-source-badge`
and artwork.

## Layer order (customization, D14)
```
@layer guard, theme, user;
```
Theme CSS loads with `layer(theme)`; user snippets load with `layer(user)`.
The `guard` layer holds `!important` rules that keep `.mp-source-badge`
displayed, visible and opaque, and keep artwork unmodified — it wins over
both `theme` and `user` regardless of cascade layer declaration order for
those specific properties.

## Rules
- CSS only, no JS.
- `url()` only relative to the theme folder.
- Must pass the fixture matrix (see `docs/PLAN.md` Section 4, Fixtures).
- Must respect `prefers-reduced-motion`.
- Must survive the opaque-rectangle fallback (transparency isn't guaranteed on
  bundled macOS builds — see PLAN.md C6).
- Artwork: unmodified, 4px radius, never under text or controls (PLAN.md D10).

## TODO before Phase 3 sign-off
- [ ] Confirm final part list against T1–T4 implementation needs.
- [ ] Document `theme.json` fields inline here (currently only in PLAN.md).
- [ ] Add one annotated example per layout variant (pill / card / strip).
