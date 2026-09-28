# Stanza — Theme Contract

**Contract version: 5**
**Status:** live at v5. v1 froze 2026-09-22 (every item in "Remaining before this
contract can be frozen" below was checked off); v2 and v3 followed the same day, v4 and v5 the day after,
each in the same change as the code that needed it. Any further change to a part,
attribute or variable name is a version bump made in the same change as the code that
needs it.

### Changelog
- **v2 (2026-09-22):** added `data-theme` to **Root** — building T4 on the `card`
  layout meant two themes could share one layout for the first time, and nothing
  distinguished their CSS once both loaded together.
- **v3 (2026-09-22):** added `data-title`, `data-artist` to **Root**, for T1's
  "Collage" layer (`content: attr(...)` in a decorative pseudo-element). Also the
  D10 relaxation landed the same day (`.mp-artwork`'s `border-radius`/`clip-path`/
  `filter`/`animation` are now theme-authorable) but didn't itself bump the
  version — no part/attribute/variable was renamed or added by that change alone.
  Nothing renamed or removed in v3 either.
- **v4 (2026-09-23):** opt-in animated effects (see **Effects**). Added to **Root**:
  `data-fx-shapes`, `data-fx-waveform`, `data-fx-title`, `data-fx-artist`. Added parts:
  `.mp-shapes`, `.mp-shape`, `.mp-waveform`, `.mp-wave-base`, `.mp-wave-fill`, `.mp-fx-filters`.
  Added app-provided variable `--mp-beat` (**simulated**, not audio). Added `effects` to
  **Variants**. Also documented here for the first time, because they shipped earlier the same
  week: the icon motion custom properties `--mp-icon-press-scale` / `--mp-icon-idle-anim`.
  Nothing renamed or removed.
- **v5 (2026-09-23):** design round 2 / theme T5 (see **Effects**). Added to **Root**: `data-fx-flow`,
  `data-fx-morph`, `data-fx-debris`; `data-fx-title`/`data-fx-artist` gain the value `splitflap`.
  Added parts: `.mp-flow`, `.mp-debris`. `.mp-fx-filters` now also carries three app-defined artwork
  filters (`mp-art-duotone`, `mp-art-posterize`, `mp-art-dither`) that a theme may apply with
  `filter: url(#…)`. Added optional theme tokens `--mp-flap-bg`, `--mp-flap-fg`, `--mp-flap-edge`.
  Added the optional `theme.json` field `fx` (effects a theme ships switched on) and `flow`, `morph`,
  `debris` to **Variants**' `effects`. Documented the track-change transition convention (the app
  starts the view transition; a theme names `.mp-window` and styles the pseudo-elements). Nothing
  renamed or removed; every v4 theme and variant keeps working unchanged apart from its `contract` number.

This file is the source of truth for the class names, data attributes and CSS custom
properties a Stanza theme may rely on. Most of it is checked by tests, not by hand:
`e2e/contract.spec.ts` compares the **Root** and **Parts** lists below with the DOM the
player really renders, and `src/theme/variant.test.ts` checks the hideable-part list against
`src/theme/structure.css`. Anything below marked *planned* is not enforced yet.

See `docs/PLAN.md` §4 for rationale and the theme roster (T1–T5).

---

## Root
`.mp-root` carries these attributes. Boolean attributes (`data-cap-*`, `data-hover`) are
**present when true and absent when false** — select them as `[data-cap-volume]`, never
`[data-cap-volume="true"]`.

- `data-layout` — `pill | card | strip`
- `data-theme` — the active theme's `id` (its `theme.json` `id`, e.g. `t2-artwork`). A theme
  scopes its CSS with `[data-layout="…"][data-theme="…"]` together, not `data-layout` alone —
  more than one theme can target the same layout (T2 and T4 both use `card`), and only
  `data-theme` tells their rules apart when both are loaded at once.
- `data-source` — `spotify | soundcloud`
- `data-status` — `idle | playing | paused | unavailable | error`
- `data-platform` — `windows | macos`
- `data-cap-seek` — the source can seek
- `data-cap-volume` — the source has volume control; when absent the volume parts are not rendered at all
- `data-cap-shuffle` — the source supports shuffle
- `data-cap-repeat` — the source supports repeat
- `data-cap-album` — the source provides an album; when absent `.mp-album` is not rendered
- `data-title` — the current track's title, verbatim, as a plain string. Only present when a
  track exists (same condition as the track block itself). `.mp-title` already renders this
  as real text — this attribute exists so a theme can read it in a *decorative* pseudo-element
  (`content: attr(data-title)`) elsewhere, e.g. `themes/t1-default`'s "Collage" backdrop.
- `data-artist` — same, for the artist.
- `data-fx-shapes` — present when the shapes effect is on (opt-in, see **Effects**).
- `data-fx-waveform` — present when the waveform effect is on.
- `data-fx-flow` — present when the flow backdrop is on (**Effects**).
- `data-fx-morph` — present when the track-change morph is on: the app wraps a track swap in a view transition.
- `data-fx-debris` — present when the previous-title debris spill is on.
- `data-fx-title` — `typewriter | ripple | liquid | splitflap`; absent when off. Applies to `.mp-title`.
- `data-fx-artist` — same, for `.mp-artist`.
- `data-hover` — the pointer is over the player. Keyboard focus does **not** set it, so a theme
  that reveals controls on hover must also reveal them on `:focus-within`.

Customization layers may also add `data-hide-<part>` (see **Hidden parts**). The player itself
never sets those.

## App-provided variables (never theme-authored, never editable)
- `--mp-progress` — 0–1, set inline on `.mp-root` by the player. **Supplied today.**
- `--mp-art-1`, `--mp-art-2`, `--mp-art-3`, `--mp-art-fg` — colors derived from the artwork
  (never its pixels), set inline on `.mp-root` alongside `--mp-progress`. **Supplied today**
  by `src/theme/palette.ts`: client-side (canvas), not the Rust `ArtworkService` PLAN.md
  describes — no real Spotify adapter exists yet to feed one (DECISIONS.md 2026-09-22).
  `art1/2/3` are the 3 most common colors in the artwork, most common first; `art-fg` is
  chosen from pure white/black against `art1` and is mathematically guaranteed to meet
  WCAG AA 4.5:1 against it (proof-by-sweep in `src/theme/palette.test.ts`).
  **These vars can still be absent** — no artwork this track, the image hasn't finished
  loading yet, or the canvas got tainted (a cross-origin artwork URL with no CORS headers,
  the exact case PLAN.md flags for a future macOS/AppleScript adapter) — so every theme must
  still give every use a fallback, e.g. `var(--mp-art-1, var(--mp-accent))`. T1 is
  `colorMode: static` and does not use them.
- `--mp-beat` — 0–1, only while an effect that uses it is on and the track is `playing` (else 0 or
  absent). Written on `.mp-shapes` and `.mp-waveform`, **not** `.mp-root`, so use it inside those
  parts. **Simulated:** a smooth per-track pulse seeded from the title and artist
  (`src/fx/beat.ts`); it does not listen to the audio and must never be presented as if it did
  (PLAN.md §9, D16). Held at 0 under `prefers-reduced-motion`. Never editable.

## Theme tokens (theme-authored)
`--mp-bg`, `--mp-fg`, `--mp-muted`, `--mp-accent`, `--mp-radius-window`, `--mp-radius-control`,
`--mp-font-display`, `--mp-font-body`, `--mp-shadow`, `--mp-motion-fast`, `--mp-motion-slow`

A theme declares them on `.mp-root[data-layout="…"][data-theme="…"]` (both attributes — see
**Root**). Only tokens listed in the theme's `controls` are editable by the customizer.

**Optional (v5), read only by the split-flap title:** `--mp-flap-bg` (tile background), `--mp-flap-fg` (tile
text), `--mp-flap-edge` (the hairline across each tile). They fall back to `--mp-bg` / `--mp-fg` / a dark
hairline, and are passed straight into the flap library's inline styles as `var()` strings. The
tile text/background pair must meet WCAG AA 4.5:1 (the matrix cannot see it — the library paints the
tiles inline — so `e2e/flap.spec.ts` checks it for T5).

---

## Parts
Every part is a class. **Grid items** (direct children of `.mp-window`, the layout grid, and so
placeable with `grid-area`): `.mp-artwork`, `.mp-meta`, `.mp-progress`, `.mp-time-current`,
`.mp-time-total`, `.mp-controls`, `.mp-volume-wrap`, `.mp-link-out`, `.mp-source-badge`, `.mp-empty`,
`.mp-error`. **Nested:** `.mp-title/.mp-artist/.mp-album` in `.mp-meta`, `.mp-progress-fill` in
`.mp-progress`, the three buttons in `.mp-controls`, `.mp-volume` in `.mp-volume-wrap`.

- `.mp-root` — outermost element; carries every attribute above
- `.mp-window` — the layout grid; the theme paints the card here (background, radius, padding)
- `.mp-artwork` — the artwork: an `<img>` when the track has artwork, otherwise an empty `<div>`. Style both. Never under interactive controls (crop/overlay/filter/animation are theme-authorable, D10 relaxed 2026-09-22 — see **Rules**).
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
- `.mp-shapes` — **opt-in** (`data-fx-shapes`): decorative SVG layer, absolutely positioned inside `.mp-window` (**not** a grid item — it needs no `grid-area`), `aria-hidden`, `pointer-events: none` (guard-locked), behind every other part, clipped to the window box.
- `.mp-shape` — a shape group inside `.mp-shapes` (four, with internal variant classes `mp-shape-a`…`mp-shape-d` and `mp-shape-ring` that are implementation detail, not themable API). Colour with `fill`; opacity, drift and beat pulse are set in `src/fx/fx.css`.
- `.mp-waveform` — **opt-in** (`data-fx-waveform`): a grid item, `aria-hidden`. A seeded, static bar profile of the track filled to `--mp-progress`, with a tiny shimmer from `--mp-beat`. Default placement (`src/fx/fx.css`) spans the progress + time rows and hides the bar and time labels with `visibility:hidden` so the window keeps its size; `pill` hides it. A theme may place it differently (T1 does).
- `.mp-wave-base` — inside `.mp-waveform`: the muted full-length bar layer. Style with `fill` on its `path`.
- `.mp-wave-fill` — inside `.mp-waveform`: the accent "played" layer stacked on the base, clipped to `--mp-progress`.
- `.mp-fx-filters` — a hidden 0×0 `<svg>` of filter definitions: the ripple/liquid text effects and, since v5, three **artwork treatments** a theme applies with `filter: url(#…)` on `.mp-artwork` (D10 allows `filter`): `#mp-art-duotone` (shadows→highlights recoloured from the track's palette; the default choice, works in every engine tried), `#mp-art-posterize` (four-level bands) and `#mp-art-dither` (ordered Bayer dither, recoloured to the duotone — relies on `feImage` inside an HTML filter, unverified in WKWebView). The colours are computed by the app from `--mp-art-*` (SVG attributes cannot read CSS variables), so a track with no palette gets plain greyscale. Always rendered, in `.mp-root` outside `.mp-window` (not a grid item). Never restyle or `display:none` it — that disables the filters.
- `.mp-flow` — **opt-in** (`data-fx-flow`): a decorative backdrop made of the real title/artist/album repeated with `·` separators; `aria-hidden`, `pointer-events: none` (guard-locked), `z-index: -2`, absolutely positioned and clipped inside `.mp-window` (**not** a grid item). It contains two empty `<i>` elements that a theme floats left/right and gives `shape-outside` so the text wraps around them (T5: two circles sized from `--mp-progress`, so the wrap reflows live). **Invisible until a theme styles it** (`color: transparent` by default) — the theme supplies colour, size and the shapes. Keep its alpha low enough that text on top stays AA against the worst-case blended backdrop (`e2e/flow.spec.ts` computes it for T5).
- `.mp-debris` — **opt-in** (`data-fx-debris`): decorative layer, `aria-hidden`, `pointer-events: none` (guard-locked), `z-index: -1`, clipped inside `.mp-window`, **empty except during a ~2.8 s spill**. When the title changes, the *previous* title's letters (at most 32, real characters only) fall, tumble and pile up (Matter.js, loaded lazily on the first spill), then fade and are destroyed. Never the readable copy; skipped under reduced motion. Themes cannot restyle the letters beyond the inherited font and `--mp-fg`.
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
  "contract": 5,
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
| `name`, `author` | string | Display strings. The theme picker (right-click menu) shows `name`, or `[NEEDS COPY]` if it is missing or blank, never the id. First-party names are placeholders tracked in docs/COPY.md "Theme names"; `author` is still `[NEEDS COPY]` and unused | `src/theme/registry.test.ts` (first-party `name` = COPY.md), `src/window/themeMenu.test.ts` |
| `version` | semver string | The theme's own version | *planned* |
| `contract` | integer | The contract version the theme was written against; must equal this file's version | variant validator |
| `layout` | `pill \| card \| strip` | The default layout | variant validator |
| `layouts` | array of layouts, optional | Extra layouts the theme supports; the customizer may switch between `layout` and these | variant validator |
| `window` | `{width, height}` px | The native window size for this theme. Must be **at least the largest the player renders in any state**, and not needlessly larger: the largest state should fill it (±1 px) — **except a theme with content that deliberately bleeds past `.mp-window`'s own edges** (`t1-default`'s "Collage" layer), which may declare real reserved margin instead | `e2e/contract.spec.ts` against every fixture (ceiling check always; "fills it" check skipped for named exceptions) |
| `colorMode` | `static \| artwork` | `artwork` = the theme uses `--mp-art-*` (needs the palette extraction) | *planned* |
| `nativeEffect` | `none \| mica \| vibrancy` | Optional native backdrop; off by default, Windows 11 only (D11/C9) | *planned* |
| `fx` | effects object, optional | Effects this theme ships switched **on**, using the same keys and values as a variant's `effects` (`shapes`, `waveform`, `flow`, `morph`, `debris`: `true`; `title`, `artist`: `typewriter \| ripple \| liquid \| splitflap`). A variant still overrides it, and switching theme resets to the new theme's own. Validated with the variant effect rules; nothing but the dev harness applies it yet (no theme loader exists) | `src/theme/variant.test.ts` (every shipped `theme.json`) |
| `controls` | map, optional | `{ "<token>": { "type": "color \| length \| number \| font", "min"?, "max"? } }`. Only these tokens are customizer-editable. App-provided variables are never editable even if listed | variant validator |

**Where the real window takes clicks (app behaviour, not a new name; no version bump).** In the native
window only the player's own boxes take clicks: the border boxes of `.mp-root` and `.mp-window` (transforms
included). Everywhere else in the declared `window`, clicks pass through to whatever is underneath: the
transparent margin, and anything that bleeds past those boxes (`t1-default`'s Collage, shadows, glows). So a
theme must keep every interactive part inside `.mp-window` (the grid items already are) and must not rely on
hover or clicks over bleed. See docs/DECISIONS.md, Slice 3.

Unknown fields: *planned* to be ignored by the Phase 4 loader (nothing reads `theme.json` at runtime yet). Copy fields hold `[NEEDS COPY]` rather than invented text.

---

## Layouts
One DOM, three grid layouts. `src/theme/structure.css` gives each layout a default
`grid-template-areas`; a theme may replace it (parts are direct children of the grid, so any
arrangement works). **Any part a theme wants visible must have an explicit grid area** — a part
with none is auto-placed by the browser and lands in whichever cell is free.

### Shared DOM (all layouts)
```html
<div class="mp-root" data-layout="…" data-theme="…" data-source="spotify" data-status="playing"
     data-platform="windows" data-cap-seek data-cap-volume data-cap-album
     data-title="…" data-artist="…"
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

### `strip` — complete, currently unused by any shipped theme
The full player: everything placed, one row per concern. Defined in `structure.css` and
still fully valid for a future theme to use — T1 (previously the only theme on `strip`)
moved to `card` in its 2026-09-22 "Ring + Depth" redesign, so nothing currently ships on
this layout.
```
grid-template-columns:  auto        1fr         auto
                        ──────────  ──────────  ──────────
row 1                   artwork     meta        badge
row 2                   progress    progress    progress
row 3                   time        time        time      ← time-current left, time-total right
row 4                   link        controls    volume
idle / error            └ .mp-empty / .mp-error span row 1, columns 1–2 ┘
```

### `pill` — compact (T3) · complete
```
grid-template-columns:  auto        1fr         auto        auto
row 1                   artwork     meta        controls    badge
row 2 (collapsed to 0 unless data-hover / :focus-within)  progress
row 3 (same)                        time        volume      link
idle / error      └ .mp-empty / .mp-error span rows 1–3, columns 1–3 (badge stays visible) ┘
```
Every part is explicitly placed — `themes/t3-pill/theme.css` fully overrides `structure.css`'s
generic pill placeholder (the documented pattern: a theme may replace the default arrangement
entirely, as long as every part it shows keeps an explicit `grid-area`). Rows 2–3 are placed but
sized to `0px` by default via a CSS custom property, revealing on `data-hover`/`:focus-within` —
the "place or hide" allowance below, done as a hide-until-interaction rather than an outright hide:
```css
.mp-root[data-layout="pill"][data-theme="t3-pill"] .mp-window {
  grid-template-rows: auto var(--t3-extra, 0px) var(--t3-extra, 0px);
  grid-template-areas: "artwork meta controls badge" "artwork progress progress progress" "artwork time volume link";
}
.mp-root[data-layout="pill"][data-theme="t3-pill"][data-hover] .mp-window,
.mp-root[data-layout="pill"][data-theme="t3-pill"]:focus-within .mp-window { --t3-extra: auto; }
```
`data-hover` never fires for keyboard users (see **Root**), so any hover-reveal theme must also
key off `:focus-within` — T3 is the first theme to actually exercise this requirement.
`e2e/contract.spec.ts`'s window-fit check hovers before measuring, since the native window can't
resize itself on hover and must already fit the expanded state.

### `card` — artwork-forward (T2) · complete
```
grid-template-columns:  1fr   (one column, items centered)
row 1  artwork
row 2  meta
row 3  progress
row 4  time      ← time-current left, time-total right (same cell, justify-self)
row 5  controls
row 6  volume
row 7  link
row 8  badge
idle / error      └ .mp-empty / .mp-error span rows 1–7, column 1 (badge stays visible) ┘
```
**T1, T4 and T5 also use `card`** (v2's reason for existing — see `data-theme` in **Root**). T4
uses the shared arrangement above unmodified. Every part is explicitly placed. Annotated
theme excerpt (from `themes/t2-artwork/theme.css`, the "Glow Card" direction — a soft
ambient glow behind the card, built from the track's own extracted colors, never the
artwork's pixels):
```css
.mp-root[data-layout="card"][data-theme="t2-artwork"] { --mp-bg: #101014; --mp-fg: #f4f4f2; }
.mp-root[data-layout="card"][data-theme="t2-artwork"] .mp-window {
  background: var(--mp-bg);
  box-shadow: 0 28px 60px -12px var(--mp-art-1, var(--mp-accent)), 0 8px 28px -6px var(--mp-art-2, var(--mp-accent));
}
.mp-root[data-layout="card"][data-theme="t2-artwork"] .mp-btn-play {
  background: var(--mp-art-1, var(--mp-accent));   /* guaranteed-AA pair (palette.test.ts) */
  color: var(--mp-art-fg, var(--mp-bg));
}
```

**T1 ("Ring + Depth", redesigned 2026-09-22) overrides `card`'s arrangement entirely**,
same documented pattern T3 used for `pill` — `.mp-progress` shares the `artwork` grid area
with `.mp-artwork` instead of getting its own row, painted as a ring around it rather than
a separate bar:
```
grid-template-columns:  1fr
row 1  artwork  ← .mp-artwork AND .mp-progress share this area (ring behind/around it)
row 2  meta
row 3  time
row 4  controls
row 5  volume
row 6  link
row 7  badge
idle / error      └ .mp-empty / .mp-error span rows 1–6, column 1 (badge stays visible) ┘
```
```css
.mp-root[data-layout="card"][data-theme="t1-default"] .mp-progress {
  grid-area: artwork;                 /* same cell as .mp-artwork — the ring frames it */
  background: conic-gradient(var(--mp-accent) calc(var(--mp-progress) * 360deg), var(--t1-ring-track) 0);
  border-radius: 50%;
  z-index: 1;                         /* behind the artwork (z-index: 2), painted after it */
}
.mp-root[data-layout="card"][data-theme="t1-default"] .mp-artwork {
  z-index: 2;
  clip-path: circle(50% at center);   /* crop — D10 relaxed 2026-09-22, see Rules */
  animation: t1-iris-in var(--mp-motion-slow) ease-out;  /* reveals via clip-path, since
                                                             opacity/transform stay locked */
}
```
`opacity`/`transform` staying guard-locked on `.mp-artwork` even after the D10 relaxation is
why this animates `clip-path` rather than a fade/scale entrance — see **Rules**.

**T1 also has a "Collage" backdrop layer (added 2026-09-22, contract v3):** the track's own
title/artist bleed behind the ring as large, low-opacity, rotated type —
`.mp-root::before`/`::after` reading `data-title`/`data-artist` via `content: attr(...)`.
Attached to `.mp-root`, not `.mp-window`, because `attr()` only reads its own host
element's attribute. Deliberately clipped mid-word (`overflow: hidden` on a bounded
`width`) rather than left to run free — real titles vary far more in length than looks
good at collage scale, and clipped text is the authentic reference aesthetic anyway, not
a workaround. **`t1-default`'s `window` (340×600) is deliberately larger than `.mp-window`
itself measures** — a documented exception to the `window` field's own "not needlessly
larger" guidance (see the field table above), reserving real margin for this layer to peek
past the card's edges without being clipped once real native-window sizing is built.
`e2e/contract.spec.ts`'s window-fit test excludes `t1-default` from the "filled by the
largest state" check for exactly this reason (the ceiling/overflow check still applies to
every theme unconditionally).

---

## Effects (v4 + v5, opt-in)
Everything here except the icons is **off by default** and switched on per user through a
variant's `effects`, or shipped on by a theme through its `theme.json` `fx`. A theme never has to author
anything for them to work, and must still look complete with them off. The app supplies the effect
runtime (`src/fx/`: anime.js for text, `@splitflap/core` for the flap board, Matter.js for debris) — the
"CSS only, no JS" rule under **Rules** is about theme authoring.

- **Icons (on for every theme, not opt-in).** The transport icons animate their inline `<svg>`
  (`src/theme/structure.css`): a press on `:active` (no remount), a pop-in when play↔pause swap,
  and a looping pulse on the play icon **only while `data-status="paused"`**. Tunable with
  `--mp-icon-press-scale` (default `0.8`) and `--mp-icon-idle-anim` (an `animation` value; set
  `none` to disable). Reduced motion turns all of it off.
- **Text effects** (`data-fx-title`, `data-fx-artist`): `typewriter` (letters revealed in turn),
  `ripple` (gentle continuous distortion), `liquid` (text resolves out of a blur on each track
  change — a coalesce-in, not an old→new morph), and (v5) `splitflap`. They animate the real text and
  never change it. While `typewriter` is active the letters are inline-blocks, which defeats
  `text-overflow: ellipsis` (an over-long title hard-clips instead). `ripple`/`liquid` share one
  SVG filter each (`.mp-fx-filters`), so title and artist using the same effect animate together.
- **`splitflap` (v5)** renders the title/artist as a Solari-style board of fixed cells (title: 10 × 20 px;
  artist: 14 × 14 px) that flips from the previous real title to the new one. Rules that make it safe:
  the flip alphabet is **only the letters of the old and new titles** (+ space), so no glyph outside the real
  text is ever shown; the board is **upper-case** (the accessible copy keeps the original case); titles longer
  than the row **page through in chunks of whole words** every 3.2 s; text the library would garble
  (emoji, astral CJK) and reduced motion fall back to the plain title. The board is `aria-hidden`; the only
  readable child of `.mp-title` is a visually-hidden exact copy of the real string. Tile colours come from
  the `--mp-flap-*` tokens.
- **Shapes and waveform** (`data-fx-shapes`, `data-fx-waveform`): see the parts above. Both are
  driven by the **simulated** `--mp-beat`.
- **Flow** (`data-fx-flow`, v5): the `.mp-flow` backdrop; a theme styles it and provides the shapes it wraps around.
- **Track-change morph** (`data-fx-morph`, v5): when the track identity (title + artist) changes, the player keeps
  showing the old card until the browser has captured it, then swaps inside
  `document.startViewTransition(...)`. Changes that are not a new track (position, play/pause) pass straight
  through with no delay and no transition. Off / unsupported / reduced motion → an instant swap. **The theme owns
  the look:** it sets `view-transition-name` on `.mp-window` and styles `::view-transition-old/new(<name>)`
  (scope them with `html:has(.mp-root[data-theme="…"][data-fx-morph])`). Use transforms, not opacity, so the
  artwork is never faded; a theme that opts in but styles nothing gets the browser's default page cross-fade,
  which fades everything. Chromium and Playwright's WebKit build support it; WKWebView on macOS is untested.
- **Debris** (`data-fx-debris`, v5): the `.mp-debris` spill described above.
- **Rules:** effects respect `prefers-reduced-motion` (static text, beat 0, no drift, no flaps, no flow reflow
  animation, no transition, no debris); decorative layers never take pointer input and never cover a control or
  the source badge; the `theme.json` `window` size must not be affected by an effect being on (`e2e/fx.spec.ts`,
  `e2e/flap.spec.ts`). Every effect uses only real track strings — no invented text.

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
guard-layer protections on `.mp-source-badge` and artwork (narrower since D10 relaxed
2026-09-22 — see **Rules** for exactly what's still locked).

## Layer order (customization, D14)
```
@layer guard, theme, user;
```
Theme CSS loads with `layer(theme)`; user snippets with `layer(user)`. The `guard` layer holds
`!important` rules that keep `.mp-source-badge` displayed, visible and opaque, and keep
artwork's `opacity`, `transform`, `mask` and `mix-blend-mode` locked. `border-radius`,
`clip-path`, `filter` and `animation` are theme/user-authorable (D10 relaxed 2026-09-22 —
DECISIONS.md). This is a guard/Rules-layer change only: it does not add an artwork-shape or
filter token to any theme's customizer `controls` map — the end-user customizer is unaffected
unless a theme later chooses to expose one.

**Status:** `src/theme/guard.css` exists and is tested against ordinary declarations, but in
Phase 3 it is a plain stylesheet, not yet inside `@layer guard`. Until the Phase 4 loader builds
the single layered shell stylesheet (S4 spike), a later stylesheet using its own `!important` on
the same property can still win. The guarantee in this section is *planned* until then.

## Variants (customizer, D14)
A variant is one JSON file per saved look, in `<app data dir>/variants/`, tied to one theme:
```json
{ "theme": "<theme id>", "contract": 4, "layout": "strip",
  "overrides": { "--mp-bg": "#101010", "--mp-radius-window": "12px" },
  "hidden": ["album", "volume"],
  "effects": { "shapes": true, "waveform": true, "flow": true, "morph": true, "debris": true, "title": "splitflap", "artist": "ripple" } }
```
`effects` is optional; omit it (or leave every value off) for no effects.
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
- an `effects` entry that is not `shapes`/`waveform`/`flow`/`morph`/`debris` (boolean) or `title`/`artist` (one of
  `typewriter`, `ripple`, `liquid`, `splitflap`) — reported as `effect-invalid`, or `unknown-key` for any other
  key. `false` is stored as absent. Enum/boolean only: no free text ever reaches CSS.
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
- Artwork: cropping (`border-radius`/`clip-path`), overlaying text/graphics, filter
  (blur/duotone) and animation are theme-authorable; never under interactive controls
  (enforced by `e2e/contract.spec.ts`'s bounding-box overlap check); `opacity`,
  `transform`, `mask`, `mix-blend-mode` stay guard-locked (PLAN.md D10, relaxed
  2026-09-22 — DECISIONS.md). Default radius 4px, theme-overridable.
- Text must meet WCAG AA 4.5:1 against its background (`e2e/matrix.spec.ts` checks every text part).
- Visible keyboard focus on every control (`src/theme/structure.css` baseline; themes may restyle, not remove).

## Remaining before this contract can be frozen
- [x] Confirm the part list against the real DOM (`e2e/contract.spec.ts`).
- [x] Document `theme.json` fields.
- [x] One annotated example per layout.
- [x] Palette extraction that actually supplies `--mp-art-1..3` / `--mp-art-fg` (2026-09-22, `src/theme/palette.ts`; AA on `--mp-art-fg` tested in `src/theme/palette.test.ts` and `e2e/palette.spec.ts`).
- [x] T2 places all parts in `card` (2026-09-22, `themes/t2-artwork/`).
- [x] T3 places all parts in `pill` (2026-09-22, `themes/t3-pill/`).
- [x] Your visual sign-off on T1 (2026-09-22, from the `npm run review` contact sheets) —
      **for T1's original strip-layout design.** T1 was substantially redesigned the same
      day ("Ring + Depth," card layout — see `card` section above and `docs/DECISIONS.md`).
- [ ] Your visual sign-off on T1's "Ring + Depth" redesign (contact sheets pending).
