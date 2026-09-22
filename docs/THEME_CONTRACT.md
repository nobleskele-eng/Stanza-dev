# Stanza — Theme Contract

**Contract version: 1**
**Status:** complete for Phase 3 review. It is frozen when Phase 3 is signed off; after that,
any change to a part, attribute or variable name is a version bump made in the same change
as the code that needs it. Until then, corrections that make this file match the code are
allowed without a bump.

This file is the source of truth for the class names, data attributes and CSS custom
properties a Stanza theme may rely on. Most of it is checked by tests, not by hand:
`e2e/contract.spec.ts` compares the **Root** and **Parts** lists below with the DOM the
player really renders, and `src/theme/variant.test.ts` checks the hideable-part list against
`src/theme/structure.css`. Anything below marked *planned* is not enforced yet.

See `docs/PLAN.md` §4 for rationale and the theme roster (T1–T4).

---

## Root
`.mp-root` carries these attributes. Boolean attributes (`data-cap-*`, `data-hover`) are
**present when true and absent when false** — select them as `[data-cap-volume]`, never
`[data-cap-volume="true"]`.

- `data-layout` — `pill | card | strip`
- `data-source` — `spotify | soundcloud`
- `data-status` — `idle | playing | paused | unavailable | error`
- `data-platform` — `windows | macos`
- `data-cap-seek` — the source can seek
- `data-cap-volume` — the source has volume control; when absent the volume parts are not rendered at all
- `data-cap-shuffle` — the source supports shuffle
- `data-cap-repeat` — the source supports repeat
- `data-cap-album` — the source provides an album; when absent `.mp-album` is not rendered
- `data-hover` — the pointer is over the player. Keyboard focus does **not** set it, so a theme
  that reveals controls on hover must also reveal them on `:focus-within`.

Customization layers may also add `data-hide-<part>` (see **Hidden parts**). The player itself
never sets those.

## App-provided variables (never theme-authored, never editable)
- `--mp-progress` — 0–1, set inline on `.mp-root` by the player. **Supplied today.**
- `--mp-art-1`, `--mp-art-2`, `--mp-art-3`, `--mp-art-fg` — colors derived from the artwork
  (never its pixels). **Declared but not yet supplied**: the palette extraction (ArtworkService)
  is not built. Until it is, themes must give every use a fallback, e.g.
  `var(--mp-art-1, var(--mp-accent))`. T1 is `colorMode: static` and does not use them.

## Theme tokens (theme-authored)
`--mp-bg`, `--mp-fg`, `--mp-muted`, `--mp-accent`, `--mp-radius-window`, `--mp-radius-control`,
`--mp-font-display`, `--mp-font-body`, `--mp-shadow`, `--mp-motion-fast`, `--mp-motion-slow`

A theme declares them on `.mp-root[data-layout="…"]`. Only tokens listed in the theme's
`controls` are editable by the customizer.

---

## Parts
Every part is a class. **Grid items** (direct children of `.mp-window`, the layout grid, and so
placeable with `grid-area`): `.mp-artwork`, `.mp-meta`, `.mp-progress`, `.mp-time-current`,
`.mp-time-total`, `.mp-controls`, `.mp-volume-wrap`, `.mp-link-out`, `.mp-source-badge`, `.mp-empty`,
`.mp-error`. **Nested:** `.mp-title/.mp-artist/.mp-album` in `.mp-meta`, `.mp-progress-fill` in
`.mp-progress`, the three buttons in `.mp-controls`, `.mp-volume` in `.mp-volume-wrap`.

- `.mp-root` — outermost element; carries every attribute above
- `.mp-window` — the layout grid; the theme paints the card here (background, radius, padding)
- `.mp-artwork` — the artwork: an `<img>` when the track has artwork, otherwise an empty `<div>`. Style both. Never under text or controls.
- `.mp-meta` — wrapper for title / artist / album. Remounted (new `key`) on every track change so a CSS animation replays without JS
- `.mp-title`
- `.mp-artist`
- `.mp-album` — only when `data-cap-album` and the track has an album
- `.mp-progress` — the progress track (not interactive in v1, see **Not in v1**)
- `.mp-progress-fill` — child of `.mp-progress`; size it with `calc(var(--mp-progress) * 100%)`
- `.mp-time-current`
- `.mp-time-total`
- `.mp-controls` — wrapper for the three transport buttons
- `.mp-btn-prev` — each button contains one inline `<svg>` icon (`aria-hidden`, `1em`, `currentColor`); size and color it with `font-size`/`color` on the button
- `.mp-btn-play` — icon swaps between play and pause with `data-status`
- `.mp-btn-next`
- `.mp-volume-wrap` — exists because a rotated `<input type="range">` needs a non-rotated ancestor to reserve its final footprint (`transform` doesn't affect layout). Grid placement and hiding target the wrapper
- `.mp-volume` — the `<input type="range">` inside the wrapper; theme-styled freely
- `.mp-source-badge` — **required, always rendered, never hideable** (guard layer, D10/C13)
- `.mp-link-out` — an `<a>`; only when the track has a permalink (Spotify via GSMTC provides none). In `strip` it lives in the artwork column and is truncated with an ellipsis rather than widening that column, so its copy must be short
- `.mp-empty` — replaces the track block when `data-status="idle"`
- `.mp-error` — replaces the track block when `data-status="error"`; shows the error detail

### Which parts exist in which state
| `data-status` | Rendered |
|---|---|
| `idle` | `.mp-empty`, `.mp-source-badge` |
| `error` | `.mp-error`, `.mp-source-badge` |
| `playing`, `paused` | the full track block (artwork, meta, progress, times, controls, and the conditional parts above) + badge |
| `unavailable` | the track block if a track is known, otherwise **only** the badge |

A theme must look complete in every row, and with every conditional part absent.

### Hidden parts
`data-hide-<part>` on `.mp-root` hides a part. Hideable: `title`, `artist`, `album`, `progress`,
`time` (both time parts), `controls`, `volume` (the wrapper), `link-out`. Never hideable:
`.mp-source-badge` and the artwork. Artwork radius and appearance are never exposed to any
customization layer.

---

## `theme.json`
```json
{
  "id": "t1-default",
  "name": "[NEEDS COPY]",
  "author": "[NEEDS COPY]",
  "version": "1.0.0",
  "contract": 1,
  "layout": "strip",
  "layouts": ["strip"],
  "window": { "width": 400, "height": 202 },
  "colorMode": "static",
  "nativeEffect": "none",
  "controls": {
    "--mp-bg": { "type": "color" },
    "--mp-radius-window": { "type": "length", "min": 0, "max": 32 }
  }
}
```
| Field | Type | Meaning | Checked |
|---|---|---|---|
| `id` | string | Unique id; equals the folder name under `themes/`. Variants bind to it | variant validator (theme match); folder-name match *planned* (Phase 4 loader) |
| `name`, `author` | string | Display strings. Copy: `[NEEDS COPY]` until you write them | — |
| `version` | semver string | The theme's own version | *planned* |
| `contract` | integer | The contract version the theme was written against; must equal this file's version | variant validator |
| `layout` | `pill \| card \| strip` | The default layout | variant validator |
| `layouts` | array of layouts, optional | Extra layouts the theme supports; the customizer may switch between `layout` and these | variant validator |
| `window` | `{width, height}` px | The native window size for this theme. Must be **at least the largest the player renders in any state**, and not needlessly larger: the largest state should fill it (±1 px) | `e2e/contract.spec.ts` against every fixture |
| `colorMode` | `static \| artwork` | `artwork` = the theme uses `--mp-art-*` (needs the palette extraction) | *planned* |
| `nativeEffect` | `none \| mica \| vibrancy` | Optional native backdrop; off by default, Windows 11 only (D11/C9) | *planned* |
| `controls` | map, optional | `{ "<token>": { "type": "color \| length \| number \| font", "min"?, "max"? } }`. Only these tokens are customizer-editable. App-provided variables are never editable even if listed | variant validator |

Unknown fields: *planned* to be ignored by the Phase 4 loader (nothing reads `theme.json` at runtime yet). Copy fields hold `[NEEDS COPY]` rather than invented text.

---

## Layouts
One DOM, three grid layouts. `src/theme/structure.css` gives each layout a default
`grid-template-areas`; a theme may replace it (parts are direct children of the grid, so any
arrangement works). **Any part a theme wants visible must have an explicit grid area** — a part
with none is auto-placed by the browser and lands in whichever cell is free.

### Shared DOM (all layouts)
```html
<div class="mp-root" data-layout="…" data-source="spotify" data-status="playing"
     data-platform="windows" data-cap-seek data-cap-volume data-cap-album
     style="--mp-progress: 0.2">            <!-- 0–1, set by the player -->
  <div class="mp-window">                   <!-- the grid; theme paints the card here -->
    <img class="mp-artwork" src="…">        <!-- or <div class="mp-artwork"> with no artwork -->
    <div class="mp-meta">                   <!-- remounted per track: animate it -->
      <div class="mp-title"></div><div class="mp-artist"></div><div class="mp-album"></div>
    </div>
    <div class="mp-progress"><div class="mp-progress-fill"></div></div>
    <div class="mp-time-current"></div><div class="mp-time-total"></div>
    <div class="mp-controls">
      <button class="mp-btn-prev"><svg/></button><button class="mp-btn-play"><svg/></button><button class="mp-btn-next"><svg/></button>
    </div>
    <div class="mp-volume-wrap"><input class="mp-volume" type="range"></div>   <!-- only if data-cap-volume -->
    <a class="mp-link-out">…</a>                                                <!-- only with a permalink -->
    <div class="mp-source-badge"></div>                                         <!-- always -->
  </div>
</div>
```
(`.mp-empty` / `.mp-error` replace the track block in the idle / error states.)

### `strip` — the flagship layout (T1) · complete
The full player: everything placed. T1's window is 400×202 in its tallest state.
```
grid-template-columns:  auto        1fr         auto
                        ──────────  ──────────  ──────────
row 1                   artwork     meta        badge
row 2                   progress    progress    progress
row 3                   time        time        time      ← time-current left, time-total right
row 4                   link        controls    volume
idle / error            └ .mp-empty / .mp-error span row 1, columns 1–2 ┘
```
Every part is explicitly placed. Annotated theme excerpt (from `themes/t1-default/theme.css`):
```css
.mp-root[data-layout="strip"] { --mp-bg: #0b0b0d; --mp-fg: #f2f0ea; /* tokens live on the root */ }
.mp-root[data-layout="strip"] .mp-window { background: var(--mp-bg); border-radius: var(--mp-radius-window); }
.mp-root[data-layout="strip"] .mp-progress-fill { width: calc(var(--mp-progress) * 100%); }  /* progress in pure CSS */
.mp-root[data-layout="strip"] .mp-meta > * { animation: mp-line-in var(--mp-motion-slow); }   /* replays per track */
```

### `pill` — compact (T3) · placeholder until Phase 4
```
grid-template-columns:  auto        1fr         auto        auto
row 1                   artwork     meta        controls    badge
```
Placed: `artwork, meta, controls, badge`. **Not placed** (a T3 theme must place or hide them):
`progress, time-current, time-total, volume-wrap, link-out, empty, error`. No theme styles this
layout yet; unstyled it looks like a browser default. To give a theme its own arrangement, override
the areas and place the extra parts:
```css
.mp-root[data-layout="pill"] .mp-window {
  grid-template-columns: auto 1fr auto auto;
  grid-template-areas: "artwork meta controls badge" "progress progress progress progress";
}
.mp-root[data-layout="pill"] .mp-progress { grid-area: progress; }
.mp-root[data-layout="pill"] .mp-time-current, .mp-root[data-layout="pill"] .mp-time-total { display: none; }
```

### `card` — artwork-forward (T2) · placeholder until Phase 4
```
grid-template-columns:  1fr   (one column, items centered)
row 1  artwork
row 2  meta
row 3  progress
row 4  controls
row 5  badge
```
Placed: `artwork, meta, progress, controls, badge`. **Not placed:** `time-current, time-total,
volume-wrap, link-out, empty, error`. Same rule as `pill`.

---

## Not in v1
Deliberately absent from contract v1. Adding any of them is a contract change.
- **Shuffle / repeat / seek controls.** `data-cap-shuffle`, `data-cap-repeat` and `data-cap-seek`
  are emitted (a theme can react to them) but there are no shuffle/repeat buttons and
  `.mp-progress` is not interactive.
- **Lyrics button** (S6, foreground-Spotify) and **genre-based fonts** (S7): a future
  `data-genre` attribute or `--mp-font-genre` variable is a candidate, decided when those
  spikes land. Not defined here.
- **Hover-reveal styling.** `data-hover` is emitted; T1 does not use it yet.

---

## Snippets
User CSS snippets may target any contract class, data attribute, or CSS custom property listed
in this document, and are subject to the same rules as themes (see **Rules**) — including the
guard-layer protections on `.mp-source-badge` and artwork.

## Layer order (customization, D14)
```
@layer guard, theme, user;
```
Theme CSS loads with `layer(theme)`; user snippets with `layer(user)`. The `guard` layer holds
`!important` rules that keep `.mp-source-badge` displayed, visible and opaque, and keep artwork
unmodified (no filter, animation, transparency, transform, clip, mask or blend; 4px radius).

**Status:** `src/theme/guard.css` exists and is tested against ordinary declarations, but in
Phase 3 it is a plain stylesheet, not yet inside `@layer guard`. Until the Phase 4 loader builds
the single layered shell stylesheet (S4 spike), a later stylesheet using its own `!important` on
the same property can still win. The guarantee in this section is *planned* until then.

## Variants (customizer, D14)
A variant is one JSON file per saved look, in `<app data dir>/variants/`, tied to one theme:
```json
{ "theme": "<theme id>", "contract": 1, "layout": "strip",
  "overrides": { "--mp-bg": "#101010", "--mp-radius-window": "12px" },
  "hidden": ["album", "volume"] }
```
Implemented and unit-tested in `src/theme/variant.ts`. Variant files are untrusted input.

**Rejects the whole file** (nothing applied): not an object; `theme` is not the active
theme's id (switching theme starts from an empty variant, never carries overrides over);
`contract` differs from the contract version; `layout` is not the theme's `layout` or
one of its `layouts`.

**Drops and reports individual entries** (the rest still applies):
- an `overrides` key not listed in the theme's `controls`. App-provided variables
  (`--mp-progress`, `--mp-art-1..3`, `--mp-art-fg`) are never editable even if a
  `theme.json` lists them.
- a value that fails its control type: `color` = `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa`
  or `rgb()`/`rgba()`; `length` = number + `px|em|rem|%`; `number`; `font` = a
  font-family list. `min`/`max` bound the numeric part (inclusive), whatever the unit.
- any value containing `url(`, `image-set`, `expression(`, `;`, `{`, `}`, a backslash,
  `@`, `/*`, `<`, `>` or a control character (checked before trimming).
- a `hidden` entry that is not one of `title, artist, album, progress, time, controls,
  volume, link-out`. The source badge and artwork can never be hidden.
- unknown top-level keys.

Failures are returned as machine codes plus a path, never as text: user-facing wording
comes from `docs/COPY.md` (currently `[NEEDS COPY]`).

**Contrast warning:** the customizer warns when the effective `--mp-fg` on `--mp-bg`
is below WCAG AA 4.5:1 (`checkVariantContrast`). It warns; it does not block saving.

## Rules
- CSS only, no JS.
- `url()` only relative to the theme folder.
- Must pass the fixture matrix (see `docs/PLAN.md` §4, Fixtures).
- Must respect `prefers-reduced-motion`.
- Must survive the opaque-rectangle fallback (transparency isn't guaranteed on bundled macOS
  builds — see PLAN.md C6).
- The page paints no background: the window is transparent, so anything a theme paints outside
  `.mp-window` shows as a rectangle behind the card. Paint the card, not the page.
- Artwork: unmodified, 4px radius, never under text or controls (PLAN.md D10).
- Text must meet WCAG AA 4.5:1 against its background (`e2e/matrix.spec.ts` checks every text part).
- Visible keyboard focus on every control (`src/theme/structure.css` baseline; themes may restyle, not remove).

## Remaining before this contract can be frozen
- [x] Confirm the part list against the real DOM (`e2e/contract.spec.ts`).
- [x] Document `theme.json` fields.
- [x] One annotated example per layout.
- [ ] Palette extraction that actually supplies `--mp-art-1..3` / `--mp-art-fg` (then test AA on `--mp-art-fg`).
- [ ] T2/T3 place all parts in `card` / `pill` (Phase 4) — the contract already states the rule.
- [ ] Your visual sign-off on T1.
