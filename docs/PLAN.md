# Stanza — Master Plan

**Stanza** — a themeable desktop mini player for Spotify and SoundCloud, built typography-first: a stanza is a structural unit of text, not an image.
*Repo description:* Themeable Spotify/SoundCloud mini player for Windows (and macOS) built with Tauri — the UI is carried by typography and motion, not album art.

Version 2 · 2026-10-17 · Status: Phases 0–4 largely built (five themes, the effects layer, theme contract v5) and production
slices 1–6 on `main`. **No real Spotify adapter on `main` yet**: the app only shows the idle state. Next: **M1 Real music**,
then **M2 Companion** (§5). Version 1 (2026-09-11, "planning, nothing built yet") is in git history.

Section numbers §0–§11 are the same as in v1, because code comments and older `docs/DECISIONS.md` entries cite them. The
companion is the new §4b. §5 now holds the status and the roadmap; the v1 phases are summarised there as history.
`docs/PRIORITIZATION_PLAN.md` was folded into §5 and deleted (D19).

---

## 0. Scope interpretation

- "Web-based design only" = every pixel of UI is HTML/CSS/SVG rendered in the Tauri webview. No raster assets from Nano Banana Pro. App icon, control icons, theme art and the companion's sprites are SVG/CSS. The companion's pixel art is data (palette grids) rendered as SVG, not image files (§4b).
- Displayed information comes only from the music services (track metadata, artwork) or from copy you write. Nothing generated.
- Platforms: Windows first (your machine), macOS second and gated on real-Mac testing.
- Sources: **v1 ships Spotify-only** (D15). SoundCloud remains the long-term second source but is deferred to a post-v1 expansion phase, grouped with Windows any-app mode — see §5 "Post-v1" and §10 open questions #5–6. Apple Music stays dropped.
- **Companion (D17):** an opt-in, original pixel-art creature that lives on and around the player: it walks, sits, climbs and hangs on the card's edges and on a ledge inside it. Specified in §4b; built in M2 (§5).

---

## 1. Decision log

| # | Decision | Status | Reason |
|---|---|---|---|
| D1 | Tauri v2 (Rust core + web frontend) | Confirmed | Design-controllable frontend, small native shell |
| D2 | No Spicetify / DOM injection | Confirmed | Inherited markup, breaks on Spotify updates |
| D3 | No macOS MediaRemote | Confirmed, stronger | macOS 15.4+ blocks unentitled clients (see C4) |
| D4 | Spotify on macOS via AppleScript | Confirmed | Still works in 2026; needs Info.plist key + entitlement (C5) |
| D5 | Spotify on Windows via GSMTC, filtered to Spotify's session | **New / changes earlier framing** | The earlier plan had no Windows path. Windows has no Spotify-specific local API (AppleScript is macOS-only). GSMTC is the public, documented Windows API — the reason the "universal OS route" was rejected was macOS, not Windows. Per-platform adapters keep the per-service spirit. |
| D6 | SoundCloud via Widget API | Confirmed, with a note | The widget *plays audio inside your app*. Spotify mode is a remote; SoundCloud mode is a host. Architecture must handle both. |
| D7 | Spotify Web API | **New: excluded from v1** | 5-user dev cap, Premium-owner requirement, endpoint removals (C1). Not needed for now-playing + transport. Revisit only for a "save to library" button. **Narrow exception planned:** S7 genre lookup (M3, §5), which you chose to allow. |
| D8 | Spotify Web Playback SDK | **New: rejected** | Needs Widevine DRM; license failures are common in desktop/embedded webviews |
| D9 | One playback source active at a time | **New constraint** | SoundCloud API Terms prohibit playback experiences that combine SoundCloud content with other services (C13) |
| D10 | Artwork's crop/filter/animation are theme-authorable; controls may never sit on top of it | **Relaxed 2026-09-22** | Originally driven by Spotify's Design Guidelines (C3) and SoundCloud's terms (C13); relaxed for this project deliberately, not a compliance claim — see amendment below and DECISIONS.md |
| D11 | No native blur/Mica/Acrylic in default themes | **New** | Your Win10 machine: Mica is Win11-only, Acrylic lags while dragging (C9). A mini player gets dragged constantly. |
| D12 | Frontend: React + TypeScript + Vite, plain CSS with custom properties, **no Tailwind** | **New** | User themes need stable semantic hooks. Utility-class soup makes a theme contract impossible. React chosen over Svelte for your and Claude Code's familiarity; bundle size is dominated by the native shell anyway. |
| D13 | Windows-first; macOS merged only after testing on a real Mac | **New** | You can't meaningfully build or test macOS from Windows. CI can compile it, but AppleScript permissions and window transparency only verify on a Mac. |
| D14 | Customization = three layers: (a) in-app customizer editing theme tokens, saved as variants; (b) user CSS snippets layered on top of the active theme; (c) importable theme packages | Confirmed | Customization is the core purpose of the project. |
| D15 | v1 ships Spotify-only on Windows; SoundCloud support and Windows any-app mode are grouped into a post-v1 expansion phase, order TBD | Confirmed | You want v1 launched with Spotify first rather than carrying SoundCloud's spike/API-terms risk (D6, D9, C13) into the critical path. |
| D16 | Opt-in animated effects (shapes, waveform, typewriter/ripple/liquid/split-flap text, flow backdrop, track-change morph, physics debris) — the audio-looking ones driven by a **simulated** beat; icon click/idle motion on by default | **New 2026-09-23** | Wanted for the design showcase. Built as an app-provided layer (`src/fx/`, anime.js MIT + SVG filters), switched on per user via variants, not baked into themes. The beat is a seeded fake — nothing analyses the audio (no clean audio source, §9) — so no UI or doc may claim it reacts to the music. Contract v4, extended in v5 by design round 2 (theme T5). See `docs/DECISIONS.md` 2026-09-23. |
| D17 | **Companion:** an opt-in, app-provided pixel-art creature on and around the player. One window grown by a margin; pixel grids rendered as SVG; a seeded state machine; interactive (click, pick up and drop), but never over the artwork, controls or source badge, and never outside the window | **New 2026-10-17** | You asked for a pet like the one on Claude's chat box that can walk, sit and hang inside and outside the frame, with skins and original designs. Pixel art, "watch + pick up", around the player only: your choices. Spec and architecture in §4b. |
| D18 | Order: real Spotify data on `main` (M1) before the companion (M2) | **New 2026-10-17** | The GSMTC spike passed on 2026-09-16 but never reached `main`, so the app only shows idle. The companion reacts to play/pause/track change, which only means something with real data. Your choice. |
| D19 | PLAN.md is the single plan again; `docs/PRIORITIZATION_PLAN.md` (spikes S5–S8) folded into §5 and deleted | **New 2026-10-17** | Two plans competed. S5 (per-app volume) and S6 (lyrics button → focus Spotify) → M1; S7 (genre fonts) → M3; S8 (window shapes): rectangles were answered by Slice 3's click-through, arbitrary silhouettes parked (§9). |

**D10 amendment (2026-09-22):** relaxed from "unmodified artwork" to "cropped
(`border-radius`/`clip-path`), overlaid, or filtered (blur/duotone) artwork —
interactive controls still never sit on top of it, and the artwork itself still
never animates in a way that would need `opacity`/`transform` (both stay locked
in `src/theme/guard.css`, along with `mask`/`mix-blend-mode`). A conscious
deviation from Spotify's Design Guidelines (C3) and, by extension, the spirit of
SoundCloud's User Content terms (C13) that originally motivated D10 — C3's own
resolution note already anticipated this exact tension ("anyone reviewing your
portfolio who knows the rules will spot a blurred-artwork background") and this
amendment accepts that tradeoff deliberately for this personal/portfolio
project, not as a claim of continued guideline compliance. D9 (one source
active, never combined) and C13's attribution requirements (badge, link-out, no
SoundCloud-confusable naming) are untouched. Full rationale: `docs/DECISIONS.md`
2026-09-22.

---

## 2. Documentation conflicts found and how they resolve

Kept as written in v1 (history). Later surprises live in `docs/DECISIONS.md`.

**C1 — Spotify Development Mode limits**
- Old tutorials: 25 test users; extended quota available to apps.
- Current (Feb 2026): 5 users per app, app owner must hold Premium, several endpoint families removed (effective Feb 11 new / Mar 9 existing apps). Extended quota is organisations-only with 250k+ MAU since May 2025.
- July 23 2026: Client IDs per account raised 1 → 25; dev-mode quota now counted per account, not per Client ID; 429s now carry `QUOTA_EXCEEDED`.
- Sub-conflict: a third-party guide reviewed July 20 2026 still says one Client ID per developer. Superseded by Spotify's own July 23 post.
- **Resolution:** trust only developer.spotify.com changelog pages dated 2026 for access rules. Drives D7.

**C2 — Can you get a SoundCloud API key?**
- `github.com/soundcloud/api` README FAQ: not issuing new keys.
- Third-party guides (early 2026): apply through a form / chatbot, manual review.
- Official developer docs (2026): self-serve registration, requires an Artist Pro subscription; a CLI registration tool exists.
- **Resolution:** the official docs are current; the GitHub FAQ is stale. Irrelevant for v1 — the Widget API needs no client_id. Only matters if you later want search or likes (Artist Pro was US$99/yr per TechCrunch, Dec 2024 — re-check current price).

**C3 — Spotify artwork corner radius**
- Current design page: 4px small/medium, 8px large.
- Legacy URL (`/documentation/general/design-and-branding/`): 2px / 4px.
- **Resolution:** current page. A mini player is "small" → 4px. Also: no cropping, no overlays or text on the artwork, no controls covering it, no blur, no animation, Spotify logo attribution alongside Spotify metadata.
- Applicability: the guidelines are written for Spotify Platform integrations; you're reading from the client through OS APIs, so strict applicability is unclear. Comply anyway — it's cheap, and anyone reviewing your portfolio who knows the rules will spot a blurred-artwork background. *(Since relaxed by the D10 amendment, §1.)*

**C4 — Getting now-playing on macOS**
- Many crates/tutorials: use MediaRemote.framework.
- Since macOS 15.4 the MediaRemote daemon checks entitlements; workarounds are a bundled Perl adapter or code injection with SIP disabled.
- **Resolution:** AppleScript (D4). Don't adopt the Perl workaround — it rides on a loophole Apple can close in any update.

**C5 — AppleScript permission in a bundled app**
- Some forum answers: `NSAppleEventsUsageDescription` is an entitlement and needs a paid developer account.
- Apple DTS: it's an **Info.plist key**; free signing works; TCC tracks the grant by code signature, so an unstable signature causes confusing failures.
- Other reports: the `com.apple.security.automation.apple-events` entitlement is also required, even non-sandboxed; if either is missing there's no prompt and the script fails silently.
- **Resolution:** ship both (Info.plist key + entitlement) and sign with the same identity every build. Expect the classic trap: works under `tauri dev` (Terminal holds the permission), fails silently in the bundle. Always test the bundle.

**C6 — Tauri window transparency on macOS**
- Docs: `transparent: true` + `macOSPrivateApi: true`.
- Open report (Tauri 2.5.x): transparent in dev, solid white after DMG bundling even with the private API enabled.
- **Resolution:** transparency is unverified until a bundled build passes on a real Mac. Design rule that makes this survivable: **every theme must also look intentional as an opaque rectangle.** (`macOSPrivateApi` means App Store rejection — irrelevant, you're not shipping there.)

**C7 — Tauri v1 vs v2 snippets (the biggest Claude Code hazard)**
- v1 patterns still dominate search results: `allowlist`, the `tauri` key in `tauri.conf.json`, `get_window()`, window-vibrancy 0.4.
- v2: capabilities/permissions files, `app.macOSPrivateApi`, `get_webview_window()`, window-vibrancy's current line (0.4 is the v1 line).
- **Resolution:** hard rule in CLAUDE.md — reject any v1 pattern on sight.

**C8 — `data-tauri-drag-region`**
- Expectation: put it on the card, the whole card drags.
- Reality: only fires when the element you actually clicked has the attribute (children don't inherit); double-click toggles maximise.
- **Resolution:** custom `mousedown` handler → `startDragging()` unless the target is inside `button, input, a, [data-no-drag]`. Add the `core:window:allow-start-dragging` permission. No maximise on double-click.

**C9 — "Glass" effects on Windows**
- Tutorials recommend Acrylic/Mica for glass-style mini players.
- window-vibrancy README: Mica is Windows 11 only; Acrylic has bad performance while resizing/dragging on Win10 v1903+ and Win11 build 22000.
- **Resolution:** D11. Native effects become an optional per-theme flag, off by default, Windows 11 only.

**C10 — GSMTC playback position**
- Tutorials read `Position` directly → progress bar freezes between updates.
- Microsoft docs: position is only current as of `LastUpdatedTime`.
- **Resolution:** interpolate — `position + (now − LastUpdatedTime) × rate` while playing; resync on the timeline-changed event.

**C11 — SoundCloud Widget docs**
- Two URLs: `/docs/html5-widget` (old) and `/docs/api/html5-widget` (current). Same content; cite the `/api/` one.
- Autoplay: the iframe needs `allow="autoplay"` or Chromium won't delegate your click to the iframe, and `play()` from your own button silently fails.

**C12 — Internal conflict in our own earlier decisions**
- "Per-service APIs, not OS-level hooks" left Windows Spotify with no mechanism. Resolved by D5.

**C13 — "Universal player" vs SoundCloud API Terms**
- Terms prohibit a playback experience combining SoundCloud content with other services, app names containing SoundCloud marks, and visual design confusingly similar to SoundCloud. They require crediting the uploader, crediting SoundCloud as the source, and backlinks to the sound's soundcloud.com URL (stated for web pages; include a link-out anyway).
- Whether these terms bind Widget-only use (no registered app) is ambiguous. Not legal advice — but design compliant anyway: it costs nothing and the project is public.
- **Resolution:** D9 (source switch, never a mixed queue), required source badge, link-out, app name free of both services' marks.

---

## 3. Architecture

```
┌──────────────────────── Tauri app ─────────────────────────────┐
│  WEBVIEW (React + TS)                                           │
│  ┌─ Player window (frameless, transparent, on-top) ✓ ─────────┐ │
│  │  Theme layer: tokens → layout → parts ✓ (contract v5)      │ │
│  │  Effects layer (src/fx) ✓     Companion layer ○ M2 (§4b)   │ │
│  │  PlayerStore ✓ (single source of truth for UI)             │ │
│  │     ▲                ▲                                      │ │
│  │     │ IPC events     │ JS events                            │ │
│  │     │                SoundCloudAdapter (hidden iframe) ○    │ │
│  └─────┼──────────────────────────────────────────────────────┘ │
│  Settings window ○ M3                                           │
│        │ invoke / events                                        │
│  RUST CORE                                                      │
│   ├─ SpotifyAdapter · Windows (GSMTC): spike ✓, main ○ M1       │
│   ├─ Per-app volume (Core Audio): ✓ (S5, M1 R3a)                │
│   ├─ SpotifyAdapter · macOS (AppleScript): ○ M5                 │
│   ├─ Hit region / click-through ✓ (Slice 3)                     │
│   ├─ ThemeService (scan, validate, watch files): spike ✓, ○ M3  │
│   └─ Shell: window state ✓ (position only), tray ○,             │
│      autostart ○, single-instance ○ (M4)                        │
└─────────────────────────────────────────────────────────────────┘
✓ on main   ○ planned (milestone in §5)
```

Two adapters live in Rust, one lives in JS. The store normalises all three into one shape. Artwork palette extraction runs in
TypeScript, not in a Rust `ArtworkService` (DECISIONS.md 2026-09-22): Windows artwork reaches the webview as a `data:` URL, so the
canvas is never tainted. Revisit Rust only if the macOS adapter's remote artwork URLs taint it.

### State model

```ts
type SourceId = 'spotify' | 'soundcloud';
type Status = 'idle' | 'playing' | 'paused' | 'unavailable' | 'error';

interface Capabilities {
  seek: boolean; volume: boolean; shuffle: boolean;
  repeat: boolean; album: boolean;
}

interface NowPlaying {
  source: SourceId;
  status: Status;
  track?: {
    title: string; artist: string; album?: string;
    artwork?: string;      // URL or data URL
    permalink?: string;    // link-out target
    durationMs?: number;
  };
  positionMs: number;
  positionUpdatedAt: number; // for interpolation (C10)
  caps: Capabilities;
  error?: { code: string; detail: string };
}
```

### Capability matrix (✓ known · ✗ not possible · ? unverified)

| | Spotify · Win (GSMTC) | Spotify · mac (AppleScript) | SoundCloud (Widget) |
|---|---|---|---|
| Title / artist | ✓ | ✓ | ✓ (uploader = artist) |
| Album | ✓ | ✓ | ✗ no album concept |
| Artwork | ✓ image bytes (resolution ?) | ✓ URL | ✓ URL |
| Play / pause / next / prev | ✓ | ✓ | ✓ |
| Position | ✓ interpolated | ✓ | ✓ progress events |
| Seek | ✓ (S2) | ✓ | ✓ |
| Volume | ✗ in GSMTC; ✓ Spotify's per-app level via Core Audio (S5, passed 2026-10-17) once Spotify has played since it started | ✓ | ✓ |
| Shuffle / repeat | ✓ shuffle (S2); repeat read ✓, set ? | ✓ (community libs set it) | ✗ native (shuffle emulatable) |
| Change events | ✓ | ? distributed notification, else polling | ✓ |
| Like / save | ✗ | ✗ | ✗ |

**Design consequence:** capabilities are exposed as `data-cap-*` attributes. Every theme must look complete when any control is absent — e.g. Spotify on Windows has no volume slider until Spotify has played since it started (no audio session to set yet, S5).

### Source rules
1. One active source. Switching pauses the other.
2. Spotify mode = remote (audio plays in Spotify). SoundCloud mode = host (audio plays in the mini player; quitting stops music; hide-to-tray must keep the webview alive).
3. SoundCloud input: paste a track / playlist / profile URL in settings. No login, no key. Persist the last URL.
4. Windows media keys: in SoundCloud mode the webview may register its own system media session. The GSMTC adapter must ignore every session that isn't Spotify's, including your own app's.
5. Spotify session identification: log the actual `SourceAppUserModelId` (it differs between the spotify.com installer and the Microsoft Store build) — don't hardcode a guessed value. S2 found `Spotify.exe` for the installer build; the Store build is unchecked.

### Artwork and colour
- Palette extraction (`src/theme/palette.ts`) yields 3 dominant colours as `--mp-art-1..3` plus a contrast-checked `--mp-art-fg` (always AA against `--mp-art-1`).
- The artwork element itself (D10, relaxed 2026-09-22): a theme may crop it
  (`border-radius`/`clip-path`), overlay text/graphics on top of it, apply
  `filter` treatments (blur, duotone), and animate it. It must never sit under
  interactive controls (the companion counts as one, §4b); `opacity`/`transform`/`mask`/`mix-blend-mode` stay
  guard-locked (`src/theme/guard.css`).

---

## 4. Theme system (the design showcase)

`docs/THEME_CONTRACT.md` is the source of truth for class names, data attributes, CSS variables and the `theme.json` fields
(currently **contract v5**). This section keeps the design intent; where the two disagree, the contract wins.

### Package
```
themes/<theme-id>/
  theme.json
  theme.css
  fonts/        optional, local files only
  preview.svg   optional, for the picker
```
Locations: bundled (read-only, app resources) and user (`<app data dir>/themes`). Today the five first-party themes are bundled
as static imports; the runtime loader and the user folder are M3 (§5).

### theme.json
Fields and which are enforced: see the contract's field table (`id`, `name`, `author`, `version`, `contract`, `layout`, `window`,
`colorMode`, `nativeEffect`, `fx`, …). M2 adds an optional `companion` field (§4b).

### Contract (summary)
- **Root:** `.mp-root` with layout, theme, source, status, capability, platform, hover, track-text and effect attributes.
- **App-provided variables:** `--mp-progress`, `--mp-art-1..3`, `--mp-art-fg`, `--mp-beat` (simulated, D16).
- **Theme tokens:** colours, radii, fonts, shadow, motion, split-flap tile colours.
- **Parts:** the player parts (`.mp-window`, `.mp-artwork`, `.mp-title`, … `.mp-source-badge`, which is required and must stay visible) plus the effect parts.
- **Rules:** CSS only, no JS. `url()` only relative to the theme folder. Must pass the fixture matrix. Must respect `prefers-reduced-motion`. Must survive the opaque-rectangle fallback (C6). Must follow D10.

**Why fixed markup:** one shared DOM, three layouts (pill / card / strip). Themes pick a layout and style it. A stable contract means themes never break on app updates — the exact failure that made Spicetify-style theming wrong for this project. Any change to a part, attribute or variable name = contract version bump, with the doc updated in the same change.

### Loading and hot swap
- Proven in the S4 spike, not yet on `main` (M3): `theme.css` loads through Tauri's asset protocol, scoped to the two theme folders, so relative font URLs resolve naturally.
- Rust file watcher → event → swap the stylesheet → instant reload while you design. S4 found that guard/theme/user layers must load as **one** shell stylesheet (`@layer guard, theme, user;` + three layered `@import`s) — separate layered `<link>`s flip order when added dynamically (DECISIONS.md 2026-09-17).
- `theme.json` validated in Rust. Broken theme → fall back to default, show the error in settings.

### Customization layers

**Customizer (a)**
- Overrides applied as inline custom properties on `.mp-root`; reset removes them. *Built:* the variant model and validation (`src/theme/variant.ts`), applied by the production player (Slice 1).
- `theme.json` gains `"layouts": [...]` and `"controls": { "<token>": { "type": "color|length|number|font", "min"?, "max"? } }`. Only listed tokens are editable. App-provided variables (`--mp-progress`, `--mp-art-*`) are never editable.
- Variant: `{ "theme", "contract", "layout", "overrides", "hidden", "effects" }`. Export/import as JSON. *Built:* persisted in webview `localStorage` (Slice 1), not yet as files in `<app data dir>/variants/` — files come with export/import in M3.
- Values validated against control type; reject anything containing `url(`, `;`, `{`, `}` (and more, see the contract). Unknown keys dropped on import.
- Hidden parts via `data-hide-<part>` on `.mp-root`. `.mp-source-badge` is never hideable. Artwork radius/appearance never exposed.
- Warn when `--mp-fg` on `--mp-bg` is below WCAG AA 4.5:1.
- Switching theme clears the previous theme's overrides.
- Parts are direct children of the layout grid so themes can rearrange them with `grid-template-areas`.
- *Not built:* the customizer UI (M3).

**CSS snippets (b)** — M3
- Import a single `.css` file via a settings button; copied to `<app data dir>/snippets/`. Each snippet can be toggled on/off. "Open in editor" launches the file in the system editor; file watcher hot-reloads on save.
- Load order via cascade layers:
  ```
  @layer guard, theme, user;
  ```
  Theme CSS imported with `layer(theme)`, snippets with `layer(user)`. Guard layer holds `!important` rules keeping `.mp-source-badge` displayed, visible and opaque, and keeping the artwork's locked properties locked. Loaded as one shell stylesheet (S4).

**Theme packages (c)** — M3
- Import a `.zip` containing `theme.json` + `theme.css` (+ `fonts/`, `preview.svg`). Validated in Rust before copying to `<app data dir>/themes/`. Invalid package → rejected with error.

**Safety (all layers)**
- Tauri CSP restricts style, font and image loading to the app (plus `data:` images). *Built:* the CSP is set (Slice 5); `asset:`/`blob:` get added when the runtime loader lands. No remote `url()` or `@import`.
- User CSS, snippets and variants apply to the player window only, never the settings window.
- Tray menu item "Reset appearance" disables all snippets and variants and restores the default theme.
- No in-app code editor in v1 (parking lot: CodeMirror panel).

### First-party themes (each stress-tests a different part of the contract)

Picker names are placeholders from COPY.md ("Default", "Glow Card", "Micro Pill", "Extreme", "Kinetic") until you replace them.

**Design rationale for the ordering below (revised 2026-09-22):** the original argument was that artwork-forward is bounded by definition — "however good the layout, it reads as unmodified square image plus reformatted text," the same genre as every other now-playing view — while a type/motion-forward theme has no such ceiling. That argument depended on D10's old strict form and no longer holds now that cropping, overlay, filter and animation are theme-authorable (D10, relaxed) — an artwork-forward theme with heavy treatment isn't generic either. T1 stays the flagship for a different, still-valid reason: its identity — type, motion, layout — is generated entirely from data the app always has, so its impact doesn't depend on any given track's artwork being present, high-resolution, or good-looking, a condition genuinely outside this project's control (GSMTC/AppleScript artwork quality varies by source, and some tracks have none at all). T2/T4's artwork-forward impact is structurally capped by the source image's own quality in a way T1's isn't. T1 also keeps its own visual sign-off and is what this document already calls "what the project is judged on" — changing flagship status was never on the table here.

- **T1 Default (flagship, "Ring + Depth"), redesigned 2026-09-22** — card layout. Circular artwork framed by its own progress ring (no separate bar); an animated `clip-path` iris wipe reveals the artwork on track change; an elevated, shadowed controls panel and staggered title/artist entrance carry the "depth" half of the direction; "Collage" puts the real title/artist behind the card as texture (contract v3). This is what ships first and what the project is judged on.
- **T2 Artwork-forward (traditional variant)** — card, `colorMode: artwork`. Proves the contract also supports the conventional approach; positioned as "the expected version," not the centerpiece.
- **T3 Pill (compact)** — minimal chrome, small footprint, hover-reveal; tests long titles and a no-image layout at minimum size.
- **T4 Extreme** — deliberately maximal. Proves the contract doesn't cap expression.
- **T5 Kinetic (added 2026-09-23, design round 2)** — a tape deck that is visibly alive: squircle body (`corner-shape`), reels whose packs follow real progress, live palette-driven artwork duotone, a split-flap title, a real-text flow backdrop wrapped around the reels, a cassette-swap track-change transition and a physics spill of the previous title. The showpiece for the opt-in effect layers.

Per theme, before any code: 4–6 named hex values, type roles, one "memorable thing", then a check that it isn't a generic default (cream + terracotta serif, black + acid green, identical soft-shadow cards, all-caps eyebrow labels).

### Copy inventory — all yours to write
- App name **Stanza** — a stanza is a structural, typographic unit of text, not an image; fits the flagship theme's type/motion-led identity. No Spotify/SoundCloud marks.
- Tagline — draft in header above; refine as you like
- Idle / nothing playing `[NEEDS COPY]`
- Spotify not running `[NEEDS COPY]`
- SoundCloud: no link set / invalid link / track unavailable `[NEEDS COPY]`
- macOS automation permission denied + how to fix `[NEEDS COPY]`
- Theme failed to load (system error detail appended) `[NEEDS COPY]`
- Settings labels, tray menu items, source-badge wording (must meet each service's attribution rules) `[NEEDS COPY]`
- Companion: creature name(s), skin and palette names, menu labels `[NEEDS COPY]` (§4b)

Keep these in `docs/COPY.md`; code reads from there.

### Fixtures (design iteration without Tauri)
- A mock adapter lets the frontend run in a normal browser with fixture states — fastest loop for design work, and Claude Code can screenshot it with Playwright.
- Fixtures are obviously synthetic strings (carrying a `FIXTURE-ONLY` marker), stored only in `/dev/fixtures`, and stripped from production builds — verified on every build by `scripts/check-fixtures-excluded.mjs`. This is how they were built in Phase 2; §10 #2 records that the policy was never formally confirmed.
- Fixture matrix: long title, long artist, CJK/accented characters, emoji, no artwork, no album, paused, idle, error, each capability off, very light / very dark / colourful artwork.
- Playwright renders in both Chromium (≈ WebView2, Windows) and WebKit (≈ WKWebView, macOS) on your Windows machine — catches most Safari-engine CSS gaps before you ever touch a Mac. Not identical to WKWebView; still needs the real-Mac pass.

---

## 4b. Companion (D17) — planned, M2

### What it is (your request, as a spec)

> **Stanza companion.** A small original pixel-art creature lives on the mini player. It walks along
> the top edge, sits (legs dangling), climbs down the sides, hangs from the bottom edge, and sits on
> a ledge inside the card when the theme has room. It reacts to playback: awake while playing, dozes
> when paused or nothing is playing, perks up on a track change. It reacts to playback state, never
> to the audio (D16). You can click it for a reaction, or pick it up and drop it; it falls and lands
> on the nearest edge. It never covers the artwork, the controls or the source badge, and never
> leaves the player's window. Skins: more creatures (species), colour palettes, and later
> accessories. It is opt-in and remembered across restarts and theme switches. It is cheap: no
> per-frame JavaScript while it's idle. It is accessible: hidden from screen readers, and a still
> pose under reduced motion. All art is made for Stanza. Other projects are inspiration only: no
> traced or recoloured sprites, and no copied code.

### Where it lives: one window, with a margin
- An app-provided layer, like the D16 effects — not theme art. Themes only declare where it may stand (below).
- When the companion is on, the native window grows by a margin **M = the pet's box** on all four sides (`fitWindowToTheme`, `src/window/nativeWindow.ts`). `.app-stage` (`src/App.css`) pads by M, and the window moves by −M, so the card doesn't jump on screen.
- The extra area is transparent and click-through already (Slice 3's hit region).
- **Rejected:** a separate pet window. It lags behind while you drag the player, and desktop roaming is parked (§9).

### Rendering: pixel grids → crisp SVG, no image files
- Each frame is a list of strings, one character per pixel, each character a palette index (`.` = transparent).
- `src/companion/sprite.ts` (pure) merges runs into one `<path>` per colour with `shape-rendering: crispEdges`. Colours come from custom properties `--mp-pet-1..8`, so a palette skin is a variable swap.
- **Scale:** one art pixel is always a whole number of device pixels: `round(2 × devicePixelRatio) / devicePixelRatio` logical px. At 125% and 150% scaling a fixed 2 px would give uneven pixels.
- **Frames:** each animation is a horizontal strip inside an `overflow: hidden` box, flipped by CSS `steps(n)`.
- **Movement:** stepped, not smooth: the pet moves one art pixel per frame at a low frame rate (pixel-art style), via CSS `steps()` on its container. JS runs only when the state changes (every few seconds), never per frame. **Why stepped (measured in the real exe, DECISIONS.md M1 R2):** in Stanza's transparent window any *smooth* endless animation costs ~10–20% of a CPU core, while the same animation stepped once a second costs about nothing. A pet that is always on screen must stay on the cheap side.

### Surfaces
- Measured from `.mp-window`'s box. A ResizeObserver re-measures when the card's height changes with its state, or with T3's hover-reveal; the pet rides a moving edge.
- **Outer edges:** top (walk, sit), left and right (climb), bottom (hang — your sketch). Positions on outer edges sit outside the card, so they never overlap its content.
- **Inner ledge (optional):** a theme declares it in `theme.json`: `"companion": { "edges": [...], "shelf": … }`. The default is all four edges and no shelf. A shelf position must overlap no artwork, control, text part or source badge, and e2e enforces it.

### Brain
- `src/companion/brain.ts`: a pure, seeded state machine. It reuses `hashString` and `mulberry32` from `src/fx/beat.ts`, so tests are deterministic.
- **States (first set):** idle, walk, sit, climb, hang, sleep, wake, react, held, fall, land.
- **Inputs:** the surfaces, playback status (playing / paused / idle), track-change and click events, drag.
- **Choice:** weighted random behaviours, Shimeji-style.
- **Reduced motion:** a still sit pose, no walking.

### Interaction ("watch + pick up")
- `.mp-companion` carries `data-no-drag`, so the window-drag handler (C8) leaves it alone.
- A click plays the react animation. A drag (pointer capture) holds the pet, clamped to the window; on drop it falls to the surface below or the nearest edge.
- **Hit region:** `.mp-companion` joins the reported parts — at rest, and at most ~10 Hz while it moves.
- **No-go zones:** the pet is interactive, so CLAUDE.md's rule ("interactive controls never on or over the artwork") applies to it. The planner treats the artwork, the controls and the source badge as no-go zones.

### Skins
- Bundled packages: `companions/<id>/companion.json` — id, name (from COPY.md), format version, grid size, named palettes, foot anchor, animations (`fps`, `loop`, frames), attachment points for later accessories.
- A validator and registry mirror `src/theme/registry.ts` / `variant.ts`: enums only, every required animation present. Format documented in a new `docs/COMPANION.md`.
- **Three skin layers:** species (a new body), palette (a colour swap on the same body), accessory (an overlay on the attachment rig, later).

### Persistence, picker, contract, copy
- **Saved setting:** the appearance (`src/theme/appearance.ts`) gains an app-wide `companion: { on, skin, palette }`. Unlike variant overrides, it survives theme switches. Validated; old saved data stays valid.
- **Picker:** the right-click menu (`src/window/themeMenu.ts`) gains a Companion submenu, keeping Slice 4's one-step-at-a-time menu lifecycle (the deadlock fix). Settings-window options come in M3.
- **Contract v6** lands with the first slice that puts companion parts in the production DOM (C2), not batched at the end: `.mp-companion` and its sprite part, `data-pet-state`, `data-pet-surface`, `--mp-pet-*`, and the `theme.json` `companion` field. Later slices update the doc in the same change.
- **Copy:** `docs/COPY.md` "Companion" section, all `[NEEDS COPY]` until you write it. No speech bubbles: emotes (heart, sleep) are pixel icons, not text.

### Designing the creature (together, as we go)
- C1 ships a deliberately plain "test dummy" so engineering never waits on art.
- **D1 design round:** three original concepts, animated in a dev-only **Companion lab** (`?lab=companion` in `DevHarness`), each tied to Stanza's type-first identity. First seeds to work out: a glyph critter, a bookworm, a tape critter. You pick or mix.
- **D2 design round:** more palettes, a second species, accessories.
- **Originality check per design:** compared against the references below (silhouette, palette, proportions), never traced or recoloured; logged in DECISIONS.md.

### Research (2026-10-17): what to learn from, what not to take

| Project | License | What we take (ideas only) | What we don't take |
|---|---|---|---|
| Claude's chat-box pet (your reference) | proprietary | Scale: a creature perched on a UI edge without blocking it | The crab silhouette or palette |
| Shimeji-ee | New BSD (code) | Actions split from behaviours, weighted behaviour choice, Fall/Dragged/Thrown as core states, edge climbing | Fan image sets (unclear rights) |
| eSheep (Windows clone) | open source | Walking on window edges, pick up and drop, a pet as one data file | Its sheep |
| oneko.js | MIT | A 32 px cell grid with states as frame lists; whole pet in a few kB | The neko sprites |
| vscode-pets | code license unconfirmed; art by credited third parties | Skins as colour variants of one body | Any art |
| VS Code chat pet sprite rules | — | Logical pixel = integer CSS px, nearest-neighbour; palette skins share geometry; accessory attachment rig; a still pose per state for reduced motion; `aria-hidden` visuals; timing in code, not images | — |
| Codex pets / Petdex | community spec | Pet = manifest + frames, rows = states; an installable, shareable format | Their atlas sizes |
| WindowPet | MIT | Proof that a Tauri + React pet overlay with click-through works | Its pets |
| BongoCat | MIT (Tauri) | Reacting to app state | Live2D (too heavy) |
| VPet | open source | Skins and mods as a community model | 200+ animations: a scope warning |

Pixel tools, if you want to draw yourself: Piskel (free, in the browser), Pixelorama (MIT), LibreSprite (GPL), Aseprite
(paid). None is required: frames are text grids. Links in §11.

---

## 5. Status and roadmap

Every milestone ends in a gate. Nothing moves forward on "should work." Work runs as **one slice per "continue"**, committed
locally on `main` ("Slice N: …"), never pushed unless you ask. Hour ranges are **rough estimates from scope**, not from any base rate.

### Where we are (2026-10-17)
- **Done:** Phase 0; spikes S1 (window), S2 (GSMTC), S4 (themes) — on their spike branches, learnings merged; Phase 2 core; Phase 3 design system + contract; Phase 4 themes T1–T5, the D16 effects layer, contract v5.
- **Production slices on `main`:** 1 theme applied + remembered · 2 real frameless transparent window · 3 click-through · 4 right-click theme picker · 5 CSP + named Stanza · 6 player centred side to side.
- **Tests at last full run (Slice 6):** 132 unit (Vitest), 610 e2e (Playwright, Chromium + WebKit), `cargo test` 4.
- **Biggest gap:** no real Spotify adapter on `main` — the app shows idle only.
- **Pending:** the Slice 5/6 real-exe check (CSP applied in the exe, saved data survives the rename, T1 centred) — waits until your own Stanza exe is closed.

### v1 phases → milestones

| v1 phase | Status | Where the rest went |
|---|---|---|
| 0 Setup | ✓ | — |
| 1 Spikes S1–S4 | ✓ S1, S2, S4; S3 deferred (D15) | S3 → Post-v1 |
| 2 Core | ✓ (manual "switch sources 10×" deferred — one source exists) | Re-run when a second source lands |
| 3 Design system + default theme | ✓ gate passed (matrix in both engines, sign-off, focus, AA incl. `--mp-art-fg`) | — |
| 4 Themes + switching | Themes ✓, picker ✓ (menu, no previews), memory flat ✓ (Slice 4) | Customizer, snippets, zip, hot swap, previews → M3 |
| 5 App shell | Window ✓ (Slices 2–3, 6) | Tray, settings, autostart, single-instance, DPI → M3/M4 |
| 6 Windows release | ○ | → M4 |
| 7 macOS | ○ | → M5 |
| 8 Portfolio | ○ | → M6 |
| PRIORITIZATION_PLAN S5–S8 | ○ | S5/S6 → M1, S7 → M3, S8 → §9 (rectangles done by Slice 3) |

### M0 — Housekeeping (now)
1. This plan (v2). Docs only.
2. The pending Slice 5/6 real-exe check; folded into M1's first real-exe run.

### M1 — Real music · ~8–14 h
- **R1 Production Spotify adapter.** Port `spike/s2-gsmtc` to `main`: a Rust GSMTC module and events, a TS `PlayerAdapter` wired into `PlayerStore` in the production app, working transport buttons, artwork as a `data:` URL (the CSP already allows it).
  **Gate:** in the real exe, 20 consecutive track changes with correct metadata; the CSP e2e re-run with real artwork, palette extraction and the effects. Driving your Spotify needs your OK at the time.
- **R2 Position, seek, error states.** Interpolation in production (C10), seek, "Spotify not running" and error states (copy slots exist).
  **Gate:** the progress bar tracks Spotify for 5 minutes without drift beyond a second; closing and reopening Spotify recovers without restarting Stanza.
- **R3 Per-app volume (S5) + lyrics button (S6).**
  - S5: Core Audio `IAudioSessionManager2` / `ISimpleAudioVolume` on Spotify's process makes `.mp-volume` real. Gate: moving the slider moves Spotify's level in the Windows volume mixer and not the master; a change made in the mixer reads back.
  - S6: a button brings Spotify's own window (and its lyrics view) to the foreground. Gate: works reliably while Spotify is minimised or behind other windows, not just the first time. Needs a contract part and a copy slot.

### M2 — Companion · ~32–52 h (§4b)
- **C0 spike** (`spike/c0-companion`): in the real exe, a 32 px placeholder box moves inside a window with the margin.
  Checks: click-through around it, dragging it, idle CPU with it on vs off (Slice 3's method), crispness at 100% (real) and 125%/150% (Playwright `deviceScaleFactor`).
  **Gate:** idle CPU change within noise (≤ ~1% of a core), no flicker, hit test correct.
- **C1 Renderer + skin format + lab:** `sprite.ts`, the validator and registry, a "test dummy" skin with every required animation, the dev-only Companion lab (every state × palette × scale, light and dark backdrops).
- **D1 design round** (with you): three original concepts in the lab; you pick or mix.
- **C2 Brain + top edge + contract v6:** idle, walk, sit, sleep, wake, reacting to playback, in the production player.
- **C3 All edges:** climbing the sides, hanging under the bottom, corner transitions, riding a moving edge; the production window margin and position shift.
- **C4 Pick up and react:** drag, drop, fall, land, click reactions; the hit region includes the pet. Real-exe drag check.
- **C5 Inner ledges:** `theme.json` `companion.shelf` for each theme that has room (some may have none).
- **C6 Skins, picker, persistence:** palettes, the Companion submenu, the app-wide saved setting; the chosen creature's art replaces the dummy.
- **D2 design round:** more palettes, a second species, accessories. Stretch: the pet swings while you drag the player.
- **Milestone gate:** a fake-clock e2e time-lapse over all five themes × the fixture matrix — the pet stays in the window and never overlaps the artwork, controls or badge; reduced-motion still pose; no console errors; CSP clean; idle CPU budget met in the real exe; visual review by you.

### M3 — Make it yours (Phase 4 leftovers) · ~15–30 h
- Settings window and customizer UI with live preview (both need copy for their chrome), variant export/import as files, snippets, theme `.zip` import, the runtime theme loader + hot swap (S4), theme previews, contrast warning, Reset appearance. Companion options in settings.
- **S7 genre-based fonts:** a scoped Spotify Web API call for artist genres (narrow D7 exception). Needs your own Spotify app Client ID/Secret first. A genre → font mapping becomes a contract question (`data-genre` / `--mp-font-genre` are candidates only).
- **Gate:** every theme still passes the matrix; swap themes 20× with no flicker (frame-captured this time); memory roughly flat.

### M4 — Shell and Windows release (v1 Phases 5–6) · ~9–16 h
- Tray (show/hide, theme, companion, Reset appearance, quit), autostart, single-instance, multi-monitor and DPI handling.
- SVG app icon → `npx tauri icon`; NSIS installer; GitHub Actions Windows build; README note that unsigned builds trigger SmartScreen.
- **Gate:** reboot with autostart on; position and scale correct at 100 / 125 / 150% display scaling; uninstall the dev build, install the CI artifact, full smoke test.
- **Stop point:** after this you have a complete, shippable Windows project even if macOS never happens.

### M5 — macOS (v1 Phase 7) · ~8–12 h + access to a Mac
- AppleScript adapter (state, track, artwork URL, position, volume, shuffle, controls). Change detection: Spotify's distributed notification (community-documented, not official) with polling fallback.
- Info.plist key + automation entitlement (C5), `macOSPrivateApi` for transparency, optional vibrancy. Click-through's non-Windows path uses Tauri getters (CPU cost unmeasured there).
- CI build on macOS runners (Apple Silicon + Intel targets).
- **Gate (real Mac, bundled .app — not dev):** automation prompt appears once and persists; S1-equivalent window test; 20 track changes. Until this passes the README says macOS is **untested**. Your Mac is school-managed (§10 #1), so this milestone may not be possible.
- Distribution: unsigned builds hit Gatekeeper warnings; notarisation needs the Apple Developer Program (US$99/yr). Not required for a portfolio piece.

### M6 — Portfolio packaging (v1 Phase 8) · ~5–8 h
- README: capability matrix, architecture diagram, theme contract, decision log (the documentation-conflict work in §2 is itself a strong engineering-application story).
- Theme and companion authoring guides, per-theme screenshots, demo video cut in After Effects (featuring the companion).
- **Gate:** someone else installs, switches themes and turns on the companion from the README alone.

**Remaining total: ~77–132 h (rough estimate).** Natural stop points after M1 (a real, working mini player), M2 (the companion) and M4 (shipped on Windows).

### Post-v1 expansion (not yet phased)
Per D15, grouped together as the next body of work after M4, no order decided yet:
- **SoundCloud support** — run the deferred S3 spike, build `SoundCloudAdapter`, source-switching UI (D9), attribution/link-out (C13).
- **Windows any-app mode** — broaden the GSMTC adapter beyond the Spotify-only AUMID filter to show any active media session.

---

## 6. Definition of done (before any promotion)

- T1–T5 pass the fixture matrix ✓ (keep it green)
- All three customization layers complete per §4
- Companion: at least one original creature with every required state, at least two palettes, the in-window / no-overlap suite green on every theme, idle CPU budget met (§4b, M2 gate)
- M1 and M4 gates passed
- README + authoring guides (themes, snippets, variants, companion skins)
- Private beta: 3–5 testers (Win10/Win11, different display scaling, Spotify installer vs Store build)
- macOS: post-launch, marked untested in README

---

## 7. Risk register
Likelihoods are qualitative — there's no reliable base rate for any of these.

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Spotify update changes GSMTC/AppleScript behaviour | Low–med | High | Adapter isolation, capability flags |
| Transparency fails in bundled mac build | Med (open issue exists) | Med | Opaque-rectangle design rule |
| Widget stops or throttles when window hidden | Unknown → S3 | High for SoundCloud mode | Keep window alive minimised/off-screen instead of hidden |
| SoundCloud terms ambiguity | — | Med | D9, attribution, non-commercial |
| No Mac access | Likely limited (school-managed MacBook) | High for the cross-platform claim | Windows-first; label macOS untested |
| Scope creep (lyrics, visualiser, likes, pet care) | High | Med | §9 parking lot; companion scope fixed by §4b |
| School workload stalls a half-built milestone | — | Med | One slice per turn; every slice leaves `main` working |
| Companion pixel art looks uneven at 125%/150% scaling | Med | Med | Whole-device-pixel scale (§4b); checked in C0 |
| An always-animating pet costs CPU/battery on an always-on-top window | **High** (measured: smooth endless animation = 10–20% of a core here, M1 R2) | Med | Stepped low-rate frames and movement, no per-frame JS; C0 CPU gate; paused/idle → a still sleep pose |
| Endless or per-tick animation in themes and effects costs CPU the same way | **Measured and fixed for T1–T5 (2026-10-17):** the paused pulse is 3 runs then still; marquee/reels are stepped; flap paging is finite; a 1 s position tick. Playing now costs 79–704 ms of CPU per 10 s (T5 was up to 7,391) | Med (an always-on app) | e2e guards: every endless theme animation must be `steps()`, no width transitions on the progress fill, ~1 render/s. Opt-in effects (shapes/waveform beat, ripple/liquid) not yet measured |
| The pet hides controls or the source badge | Low (by design) | High (usability, attribution) | No-go zones in the planner; e2e time-lapse over every theme |
| Creature art too close to someone else's | Low | High | Original designs only; per-design originality check, logged |

---

## 8. Claude Code workflow

Targets the "confirmed it understood, then failed repeatedly" problem.

1. **One task = one gate.** Before editing, Claude Code states: files it will touch, the acceptance check, the exact command it will run to verify. Plan mode for anything touching more than two files.
2. **Verification ladder.** Claude runs 1–3 itself; you do 4.
   1. `npx tsc --noEmit` + lint
   2. `cargo check` + `cargo clippy` (+ `cargo test`, `cargo fmt --check`)
   3. Unit tests / Playwright fixture runs (Chromium + WebKit); `npm run tauri build -- --no-bundle` and a real-exe drive for window, native or CSP work
   4. Your visual check — in the real exe for any window, transparency or permission work
3. **"Done" wording.** Claude may only say "passes X" for checks it ran and quotes. Visual work = "ready for your review," never "done."
4. **Two-strike rule.** Same task fails twice → stop, write a diagnosis (what was assumed, what the logs show, what's different from the docs) before attempt three. No blind retries.
5. **Spikes stay on throwaway branches.** Merge the learnings into `DECISIONS.md`, not the code.
6. **Real-exe runs:** check first that your own Stanza exe isn't running (a second instance shares its WebView2 profile and saved theme).

The project rules live in `CLAUDE.md` at the repo root. (v1 of this plan carried a seed copy here; it had the pre-2026-09-22 artwork rule and was removed.)

---

## 9. Parking lot (not v1)

- Apple Music, YouTube Music, local files, Linux
- Spotify Web API features (like/save, queue, search) — only with Premium and the 5-user dev cap
- SoundCloud API features (search, logged-in likes) — needs Artist Pro
- Audio visualiser (real audio reaction) — no clean audio source: Spotify's stream isn't accessible, the SoundCloud iframe is cross-origin. Windows system-audio loopback is possible but a separate project. **Partly superseded by D16 (2026-09-23):** decorative shapes/waveform now exist but run on a *simulated* beat, not the music; real audio reaction is still parked.
- Lyrics inside Stanza (S6 only brings Spotify's own window forward)
- Theme sharing / marketplace (and a companion-skin gallery)
- Notarised or store distribution
- In-app CSS editor (CodeMirror panel)
- Companion: roaming the whole desktop (Shimeji-style, a second window); pet-care stats (mood, feeding, growth); moving to the simulated beat (would need D16 wording care); a PNG-strip importer for skins drawn in Piskel/Pixelorama
- S8 arbitrary window silhouettes (rectangular click-through is done, Slice 3)

---

## 10. Open questions

1. Do you have regular access to a Mac? Determines whether M5 exists. **Answered:** it's a school-regulated MacBook — take M5 as uncertain/lower-confidence until actually tested; school device management may restrict signing, dev tools, or permissions.
2. Fixture policy: synthetic strings (recommended) or real metadata you supply? **Never formally answered**; fixtures have been synthetic since Phase 2. Say if you want otherwise.
3. Tagline — draft above, yours to finalize. **Still open.**
4. Spotify Premium — only matters if Web API features ever come back. **Answered:** confirmed, you have Premium.
5. Windows any-app mode (show any media session, not only Spotify)? **Answered:** confirmed desired — Post-v1 (§5), order relative to SoundCloud TBD (D15).
6. SoundCloud in the finished scope? **Answered:** deferred — v1 ships Spotify-only (D15); the S3 spike waits until Post-v1.
7. Companion copy: the creature's name, skin and palette names, menu labels. **Open** — `[NEEDS COPY]` until you write them.
8. Which creature? **Open** — decided in the D1 design round (M2).
9. S7 genre fonts: your Spotify app Client ID/Secret. **Open** — needed before M3's S7 starts.
10. Split-flap in-between glyphs (DECISIONS.md 2026-09-23): does a flap passing through letters of the old/new title break "never generate displayed text"? **Open** — the conservative reading is built.

---

## 11. Sources

- Spotify quota update, July 23 2026 — developer.spotify.com/blog/2026-07-23-web-api-quota-updates
- Spotify Web API changelog, July 2026 — developer.spotify.com/documentation/web-api/references/changes/july-2026
- Spotify Dev Mode changes, Feb 2026 — techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/
- Spotify Design & Branding (current) — developer.spotify.com/documentation/design
- Spotify Design & Branding (legacy radius values) — developer.spotify.com/documentation/general/design-and-branding/
- SoundCloud: Get an API key — developers.soundcloud.com/docs/api/register-app
- SoundCloud: self-serve keys announcement — developers.soundcloud.com/blog/vibe-coding-ai-agent-docs-self-serve-api-keys/
- SoundCloud API README (stale FAQ) — github.com/soundcloud/api
- SoundCloud API Terms of Use — developers.soundcloud.com/docs/api/terms-of-use
- SoundCloud Widget API — developers.soundcloud.com/docs/api/html5-widget
- Artist Pro pricing (Dec 2024) — techcrunch.com/2024/12/17/soundcloud-introduces-a-new-cheaper-paid-plan-for-artists
- MediaRemote 15.4 entitlement lock — docs.rs/crate/media-remote/latest
- AppleScript Info.plist vs entitlement — developer.apple.com/forums/thread/710896
- Tauri mac transparency lost after bundling — github.com/tauri-apps/tauri/issues/13415
- Drag-region click-target behaviour — github.com/tauri-apps/tauri/pull/1656
- window-vibrancy platform notes — github.com/tauri-apps/window-vibrancy
- GSMTC timeline position — learn.microsoft.com (GlobalSystemMediaTransportControlsSessionTimelineProperties.Position)
- tauri-action (CI builds) — github.com/tauri-apps/tauri-action

**Companion research (2026-10-17).** License notes are as found; re-check a project's LICENSE file before relying on it. No art or code from these is used.
- Shimeji-ee (New BSD) — github.com/gil/shimeji-ee
- eSheep, Windows clone — apps.microsoft.com/detail/9mx2v0tqt6rm
- oneko.js (MIT) — oneko.clove.is-a.dev (source: github.com/adryd325/oneko.js)
- vscode-pets — github.com/tonybaloney/vscode-pets
- VS Code chat pet sprite rules — skills.cat/skills/microsoft/vscode/chat-pet-sprite-creation
- Codex pet format (community) — cdn.jsdelivr.net/npm/@omega3_0/nanoagent@1.1.0/skills/hatch-pet/references/codex-pet-contract.md; Petdex — github.com/crafter-station/petdex
- WindowPet (MIT, Tauri + React) — github.com/SeakMengs/WindowPet
- BongoCat (MIT, Tauri) — hellogithub.com/en/repository/ayangweb/BongoCat
- VPet — store.steampowered.com/app/1920960/VPet_Simulator/
- Pixelorama (MIT) — github.com/orama-interactive/pixelorama; Piskel — best-of-web.builder.io/library/piskelapp/piskel
