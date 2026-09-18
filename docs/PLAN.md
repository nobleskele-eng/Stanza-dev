# Stanza — Master Plan

**Stanza** — a themeable desktop mini player for Spotify and SoundCloud, built typography-first: a stanza is a structural unit of text, not an image.
*Repo description:* Themeable Spotify/SoundCloud mini player for Windows (and macOS) built with Tauri — the UI is carried by typography and motion, not album art.

Version 1 · 2026-09-11 · Status: planning, nothing built yet
Drop this in the repo as `docs/PLAN.md`. Section 8 is the seed for `CLAUDE.md`.

---

## 0. Scope interpretation

- "Web-based design only" = every pixel of UI is HTML/CSS/SVG rendered in the Tauri webview. No raster assets from Nano Banana Pro. App icon, control icons and theme art are SVG/CSS.
- Displayed information comes only from the music services (track metadata, artwork) or from copy you write. Nothing generated.
- Platforms: Windows first (your machine), macOS second and gated on real-Mac testing.
- Sources: Spotify + SoundCloud. Apple Music stays dropped.

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
| D7 | Spotify Web API | **New: excluded from v1** | 5-user dev cap, Premium-owner requirement, endpoint removals (C1). Not needed for now-playing + transport. Revisit only for a "save to library" button. |
| D8 | Spotify Web Playback SDK | **New: rejected** | Needs Widevine DRM; license failures are common in desktop/embedded webviews |
| D9 | One playback source active at a time | **New constraint** | SoundCloud API Terms prohibit playback experiences that combine SoundCloud content with other services (C13) |
| D10 | Artwork shown unmodified; ambience comes from colours *derived* from it | **New design constraint** | Spotify guidelines forbid crop/blur/overlay/animation of artwork; SoundCloud terms forbid modifying User Content (C3, C13) |
| D11 | No native blur/Mica/Acrylic in default themes | **New** | Your Win10 machine: Mica is Win11-only, Acrylic lags while dragging (C9). A mini player gets dragged constantly. |
| D12 | Frontend: React + TypeScript + Vite, plain CSS with custom properties, **no Tailwind** | **New** | User themes need stable semantic hooks. Utility-class soup makes a theme contract impossible. React chosen over Svelte for your and Claude Code's familiarity; bundle size is dominated by the native shell anyway. |
| D13 | Windows-first; macOS merged only after testing on a real Mac | **New** | You can't meaningfully build or test macOS from Windows. CI can compile it, but AppleScript permissions and window transparency only verify on a Mac. |
| D14 | Customization = three layers: (a) in-app customizer editing theme tokens, saved as variants; (b) user CSS snippets layered on top of the active theme; (c) importable theme packages | Confirmed | Customization is the core purpose of the project. |

---

## 2. Documentation conflicts found and how they resolve

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
- Applicability: the guidelines are written for Spotify Platform integrations; you're reading from the client through OS APIs, so strict applicability is unclear. Comply anyway — it's cheap, and anyone reviewing your portfolio who knows the rules will spot a blurred-artwork background.

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
┌──────────────────────── Tauri app ────────────────────────┐
│  WEBVIEW (React + TS)                                      │
│  ┌─ Player window (frameless, transparent, on-top) ──────┐ │
│  │  Theme layer: tokens → layout variant → parts         │ │
│  │  PlayerStore (single source of truth for UI)          │ │
│  │     ▲                ▲                                │ │
│  │     │ IPC events     │ JS events                      │ │
│  │     │                SoundCloudAdapter (hidden iframe)│ │
│  └─────┼────────────────────────────────────────────────┘ │
│  Settings window (normal, decorated)                       │
│        │ invoke / events                                   │
│  RUST CORE                                                 │
│   ├─ SpotifyAdapter · Windows (GSMTC)                      │
│   ├─ SpotifyAdapter · macOS (AppleScript)                  │
│   ├─ ArtworkService (fetch, palette extraction)            │
│   ├─ ThemeService (scan, validate, watch files)            │
│   └─ Shell: tray, window state, autostart, single-instance │
└────────────────────────────────────────────────────────────┘
```

Two adapters live in Rust, one lives in JS. The store normalises all three into one shape.

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

### Capability matrix (✓ known · ✗ not possible · ? verify in Phase 1)

| | Spotify · Win (GSMTC) | Spotify · mac (AppleScript) | SoundCloud (Widget) |
|---|---|---|---|
| Title / artist | ✓ | ✓ | ✓ (uploader = artist) |
| Album | ✓ | ✓ | ✗ no album concept |
| Artwork | ✓ image bytes (resolution ?) | ✓ URL | ✓ URL |
| Play / pause / next / prev | ✓ | ✓ | ✓ |
| Position | ✓ interpolated | ✓ | ✓ progress events |
| Seek | ? | ✓ | ✓ |
| Volume | ✗ GSMTC has none | ✓ | ✓ |
| Shuffle / repeat | ? | ✓ (community libs set it) | ✗ native (shuffle emulatable) |
| Change events | ✓ | ? distributed notification, else polling | ✓ |
| Like / save | ✗ | ✗ | ✗ |

**Design consequence:** capabilities are exposed as `data-cap-*` attributes. Every theme must look complete when any control is absent — e.g. Spotify on Windows has no volume slider at all.

### Source rules
1. One active source. Switching pauses the other.
2. Spotify mode = remote (audio plays in Spotify). SoundCloud mode = host (audio plays in the mini player; quitting stops music; hide-to-tray must keep the webview alive).
3. SoundCloud input: paste a track / playlist / profile URL in settings. No login, no key. Persist the last URL.
4. Windows media keys: in SoundCloud mode the webview may register its own system media session. The GSMTC adapter must ignore every session that isn't Spotify's, including your own app's.
5. Spotify session identification: log the actual `SourceAppUserModelId` during the spike (it differs between the spotify.com installer and the Microsoft Store build) — don't hardcode a guessed value.

### Artwork and colour
- Rust fetches the artwork (no canvas CORS problems) and extracts 3–5 dominant colours, exposed as `--mp-art-1..3` plus a contrast-checked `--mp-art-fg`.
- The artwork element itself: unmodified, 4px radius, never under text or controls.

---

## 4. Theme system (the design showcase)

### Package
```
themes/<theme-id>/
  theme.json
  theme.css
  fonts/        optional, local files only
  preview.svg   optional, for the picker
```
Locations: bundled (read-only, app resources) and user (`<app data dir>/themes`).

### theme.json
```json
{
  "id": "example-id",
  "name": "[NEEDS COPY]",
  "author": "[NEEDS COPY]",
  "version": "1.0.0",
  "contract": 1,
  "layout": "pill | card | strip",
  "window": { "width": 360, "height": 96 },
  "colorMode": "static | artwork",
  "nativeEffect": "none | mica | vibrancy"
}
```

### Contract v1 (goes in `docs/THEME_CONTRACT.md`)
- **Root:** `.mp-root` with `data-layout`, `data-source`, `data-status`, `data-cap-seek|volume|shuffle|repeat|album`, `data-platform`, `data-hover`.
- **App-provided variables:** `--mp-progress` (0–1, so themes can draw progress in pure CSS — bars, rings, fills), `--mp-art-1..3`, `--mp-art-fg`.
- **Theme tokens:** `--mp-bg`, `--mp-fg`, `--mp-muted`, `--mp-accent`, `--mp-radius-window`, `--mp-radius-control`, `--mp-font-display`, `--mp-font-body`, `--mp-shadow`, `--mp-motion-fast`, `--mp-motion-slow`.
- **Parts:** `.mp-window`, `.mp-artwork`, `.mp-meta`, `.mp-title`, `.mp-artist`, `.mp-album`, `.mp-progress`, `.mp-progress-fill`, `.mp-time-current`, `.mp-time-total`, `.mp-controls`, `.mp-btn-prev`, `.mp-btn-play`, `.mp-btn-next`, `.mp-volume`, `.mp-source-badge` (required, must stay visible), `.mp-link-out`, `.mp-empty`, `.mp-error`.
- **Rules:** CSS only, no JS. `url()` only relative to the theme folder. Must pass the fixture matrix. Must respect `prefers-reduced-motion`. Must survive the opaque-rectangle fallback (C6). Must follow D10.

**Why fixed markup:** three fixed DOM structures (pill / card / strip). Themes pick one and style it. A stable contract means themes never break on app updates — the exact failure that made Spicetify-style theming wrong for this project. Markup changes = contract version bump.

### Loading and hot swap
- `theme.css` loads through a `<link>` using Tauri's asset protocol, scoped to the two theme folders — relative font URLs resolve naturally.
- Rust file watcher → event → swap `href` with a cache-busting query → instant reload while you design.
- `theme.json` validated in Rust. Broken theme → fall back to default, show the error in settings.

### Customization layers

**Customizer (a)**
- Overrides applied with `style.setProperty` on `.mp-root`; reset removes them.
- `theme.json` gains `"layouts": [...]` and `"controls": { "<token>": { "type": "color|length|number|font", "min"?, "max"? } }`. Only listed tokens are editable. App-provided variables (`--mp-progress`, `--mp-art-*`) are never editable.
- Variant file: `{ "theme", "contract", "layout", "overrides", "hidden" }` in `<app data dir>/variants/`. Export/import as JSON.
- Values validated against control type; reject anything containing `url(`, `;`, `{`, `}`. Unknown keys dropped on import.
- Hidden parts via `data-hide-<part>` on `.mp-root`. `.mp-source-badge` is never hideable. Artwork radius/appearance never exposed.
- Warn when `--mp-fg` on `--mp-bg` is below WCAG AA 4.5:1.
- Switching theme clears the previous theme's overrides.
- Parts are direct children of the layout grid so themes can rearrange them with `grid-template-areas`.

**CSS snippets (b)**
- Import a single `.css` file via a settings button; copied to `<app data dir>/snippets/`. Each snippet can be toggled on/off. "Open in editor" launches the file in the system editor; file watcher hot-reloads on save.
- Load order via cascade layers:
  ```
  @layer guard, theme, user;
  ```
  Theme CSS imported with `layer(theme)`, snippets with `layer(user)`. Guard layer holds `!important` rules keeping `.mp-source-badge` displayed, visible and opaque, and keeping artwork unmodified. Implementation detail (how the layered imports are loaded under the CSP) is decided in the S4 spike.

**Theme packages (c)**
- Import a `.zip` containing `theme.json` + `theme.css` (+ `fonts/`, `preview.svg`). Validated in Rust before copying to `<app data dir>/themes/`. Invalid package → rejected with error.

**Safety (all layers)**
- Tauri CSP restricts style, font and image loading to the app and the asset protocol (plus `data:` for artwork). No remote `url()` or `@import`. Artwork for every source is supplied by Rust as data, never loaded by URL in the webview.
- User CSS, snippets and variants apply to the player window only, never the settings window.
- Tray menu item "Reset appearance" disables all snippets and variants and restores the default theme.
- No in-app code editor in v1 (parking lot: CodeMirror panel).

### First-party themes (each stress-tests a different part of the contract)

**Design rationale for the ordering below:** artwork and track/artist text are the only things Spotify/SoundCloud restrict — unmodified image, unaltered strings. Everything else (layout, shape, motion, type, color, iconography, control affordances) is fully yours. An artwork-forward theme is bounded by definition: however good the layout, it reads as "unmodified square image + reformatted text," and it sits in the same genre as every other now-playing view, official or fan-made. A typography/motion-forward theme has no such ceiling and isn't a reskin of anything that already exists. So the type-led theme is the flagship, not the fallback.

- **T1 Default (flagship)** — type/motion-led, artwork optional or reduced to a small accent. The extracted-palette system (colors pulled from the artwork, never the pixels themselves) carries per-track identity here — kinetic type on track change, real type scale and rhythm doing the work that artwork would otherwise do. This is what ships first and what the project is judged on.
- **T2 Artwork-forward (traditional variant)** — card, `colorMode: artwork`. Proves the contract also supports the conventional approach; positioned as "the expected version," not the centerpiece.
- **T3 Pill (compact)** — minimal chrome, small footprint, tests long titles and a no-image layout at minimum size.
- **T4 Extreme** — deliberately maximal, your call on direction. Proves the contract doesn't cap expression.

Per theme, before any code: 4–6 named hex values, type roles, one "memorable thing", then a check that it isn't a generic default (cream + terracotta serif, black + acid green, identical soft-shadow cards, all-caps eyebrow labels).

### Copy inventory — all yours to write
- App name **Stanza** — a stanza is a structural, typographic unit of text, not an image; fits the flagship theme's type/motion-led identity. No Spotify/SoundCloud marks.
- Tagline — draft in header above (`a themeable desktop mini player… built typography-first`); refine as you like
- Idle / nothing playing `[NEEDS COPY]`
- Spotify not running `[NEEDS COPY]`
- SoundCloud: no link set / invalid link / track unavailable `[NEEDS COPY]`
- macOS automation permission denied + how to fix `[NEEDS COPY]`
- Theme failed to load (system error detail appended) `[NEEDS COPY]`
- Settings labels, tray menu items, source-badge wording (must meet each service's attribution rules) `[NEEDS COPY]`

Keep these in `docs/COPY.md`; code reads from there.

### Fixtures (design iteration without Tauri)
- A mock adapter lets the frontend run in a normal browser with fixture states — fastest loop for design work, and Claude Code can screenshot it with Playwright.
- **This touches your "never generate displayed info" rule — decide once:**
  - Recommended: obviously synthetic strings ("Fixture title, 64 characters, overflow test…"), stored only in `/dev/fixtures`, stripped from production builds by a build check.
  - Alternative: you supply real metadata you're fine seeing.
- Fixture matrix: long title, long artist, CJK/accented characters, no artwork, no album, paused, idle, error, each capability off, very light artwork, very dark artwork.
- Playwright can render in both Chromium (≈ WebView2, Windows) and WebKit (≈ WKWebView, macOS) on your Windows machine — catches most Safari-engine CSS gaps before you ever touch a Mac. Not identical to WKWebView; still needs the real-Mac pass.

---

## 5. Phases and gates

Every phase ends in a gate. Nothing moves forward on "should work."
Hour ranges are **rough estimates from scope**, not from any base rate.

### Phase 0 — Setup · ~2–4 h
- Install Rust (rustup + MSVC build tools), Node LTS, Tauri v2 Windows prerequisites.
- `npm create tauri-app@latest` → React + TypeScript.
- GitHub repo with `docs/PLAN.md`, `CLAUDE.md`, `docs/DECISIONS.md`, `docs/THEME_CONTRACT.md` (stub), `docs/COPY.md`.
- **Gate:** `npm run tauri dev` opens a window; `npx tauri info` shows 2.x for every Tauri package and WebView2 present.

### Phase 1 — Spikes (throwaway branch) · ~8–12 h
Prove the risky assumptions before building anything real.
- **S1 Window:** frameless, transparent, always-on-top, CSS-drawn rounded corners and shadow (native shadow off), custom drag handler, buttons still clickable.
  Gate: passes in `tauri dev` **and** in the installed NSIS build; no white flash on show; drag is smooth. Fail → opaque-rectangle fallback becomes the default.
- **S2 GSMTC:** Rust reads Spotify's session — title, artist, album, thumbnail, timeline, status; events fire; controls work. Test seek and shuffle to fill the `?` cells. Log the Spotify session ID. Ignore all other sessions.
  Gate: 20 consecutive track changes, all metadata correct (count them).
- **S3 SoundCloud widget:** CSP allows the widget, hidden iframe, `allow="autoplay"`, `play()` from your own button, events fire, current-sound artwork returned. Test track, playlist, profile and `/likes` URLs. Test whether playback and progress events continue while the window is hidden to tray.
  Gate: 10 minutes of continuous playlist playback while hidden.
- **S4 Themes:** asset protocol scoped; theme CSS + local font load via `<link>`; editing the file updates the UI; malformed CSS doesn't crash. CSP blocks a remote `url()` in a test snippet; layered `@import` loading works under the CSP; guard layer beats a snippet that sets `.mp-source-badge {display:none !important}`; inline overrides survive hot swap; system font enumeration from Rust (untested).
  Gate: edit → visible change feels instant; broken file → default theme + error shown.
- **Checkpoint:** update the capability matrix and `DECISIONS.md` with what actually happened. Only then Phase 2.

### Phase 2 — Core · ~8–12 h
- `PlayerStore`, `NowPlaying` type, adapter interface (Rust trait + TS interface), position interpolation, source switching, persistence (last source, SoundCloud URL, theme, window position via the window-state plugin).
- Mock adapter + fixtures for browser dev.
- **Gate:** unit tests for interpolation and source switching; typecheck clean; `cargo clippy` clean; manual: switch sources 10× and never hear both at once.

### Phase 3 — Design system + default theme · ~13–20 h
- Write `THEME_CONTRACT.md` v1.
- Build the three layout DOMs and T1.
- States: idle, loading, error, missing-capability.
- Motion: one orchestrated moment (track change), hover-reveal controls, reduced-motion path.
- Contract v1 includes controls, layouts, `data-hide-*`, guard layer, grid-child rule; variant data model + validation with unit tests (+3–5 h, rough estimate).
- **Gate:** Playwright screenshots of T1 × full fixture matrix (Chromium + WebKit); your visual sign-off; visible keyboard focus; text on `--mp-art-fg` meets WCAG AA 4.5:1.

### Phase 4 — Themes + switching · ~21–38 h
- T2–T4, theme picker with previews, hot swap, user theme folder with "open folder" action, per-theme window resize, validation errors surfaced.
- Customizer UI with live preview; variant export/import; snippet import/toggle/open-in-editor; theme `.zip` import; contrast warning; Reset appearance (+11–23 h, rough estimate).
- **Gate:** every theme passes the matrix; swap themes 20× with no flicker; memory in Task Manager roughly flat before vs after.

### Phase 5 — App shell · ~6–10 h
- Tray (show/hide, source, theme, quit), settings window, autostart, single-instance, multi-monitor and DPI handling, remembered position.
- **Gate:** reboot with autostart on; position and scale correct at 100 / 125 / 150% display scaling.

### Phase 6 — Windows release · ~3–6 h
- SVG app icon → `npx tauri icon`; NSIS installer; GitHub Actions Windows build; README note that unsigned builds trigger SmartScreen.
- **Gate:** uninstall the dev build, install the CI artifact, full smoke test.
- **Stop point:** after this phase you have a complete, shippable Windows project even if macOS never happens.

### Phase 7 — macOS · ~8–12 h + access to a Mac
- AppleScript adapter (state, track, artwork URL, position, volume, shuffle, controls). Change detection: Spotify's distributed notification (community-documented, not official) with polling fallback.
- Info.plist key + automation entitlement (C5), `macOSPrivateApi` for transparency, optional vibrancy.
- CI build on macOS runners (Apple Silicon + Intel targets).
- **Gate (real Mac, bundled .app — not dev):** automation prompt appears once and persists; S1-equivalent window test; 20 track changes. Until this passes the README says macOS is **untested**.
- Distribution: unsigned builds hit Gatekeeper warnings; notarisation needs the Apple Developer Program (US$99/yr). Not required for a portfolio piece.

### Phase 8 — Portfolio packaging · ~5–8 h
- README: capability matrix, architecture diagram, theme contract, decision log (the documentation-conflict work in Section 2 is itself a strong engineering-application story).
- Theme authoring guide, per-theme screenshots, demo video cut in After Effects.
- **Gate:** someone else installs and switches themes from the README alone.

**Total: ~74–122 h (rough estimate).** At 5 h/week ≈ 15–24 weeks; at 8 h/week ≈ 9–15 weeks. Natural stop points after Phase 3 (design showcase works in a browser) and Phase 6 (shipped on Windows).

---

## 6. Definition of done (before any promotion)

- T1–T4 pass the fixture matrix
- All three customization layers complete per §4
- Phase 5 and 6 gates passed
- README + theme authoring guide (covering themes, snippets, variants)
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
| No Mac access | Depends on you | High for the cross-platform claim | Windows-first; label macOS untested |
| Scope creep (lyrics, visualiser, likes) | High | Med | Section 9 parking lot |
| School workload stalls a half-built phase | — | Med | Every phase ends in a working state; two stop points |

---

## 8. Claude Code workflow

Targets the "confirmed it understood, then failed repeatedly" problem.

1. **One task = one gate.** Before editing, Claude Code states: files it will touch, the acceptance check, the exact command it will run to verify. Plan mode for anything touching more than two files.
2. **Verification ladder.** Claude runs 1–3 itself; you do 4.
   1. `npm run typecheck` + lint
   2. `cargo check` + `cargo clippy`
   3. Unit tests / Playwright fixture screenshots
   4. Your visual check in `tauri dev` — and in the bundled build for any window, transparency or permission work
3. **"Done" wording.** Claude may only say "passes X" for checks it ran and quotes. Visual work = "ready for your review," never "done."
4. **Two-strike rule.** Same task fails twice → stop, write a diagnosis (what was assumed, what the logs show, what's different from the docs) before attempt three. No blind retries.
5. **Spikes stay on throwaway branches.** Merge the learnings into `DECISIONS.md`, not the code.

### CLAUDE.md seed
```
# Project rules

## Stack
- Tauri v2 ONLY. Reject v1 patterns on sight: "allowlist", a top-level "tauri" key
  in tauri.conf.json, get_window(), window-vibrancy 0.4. Permissions live in
  src-tauri/capabilities/.
- Frontend: React + TypeScript + Vite. Plain CSS + custom properties. NO Tailwind.

## Contracts
- docs/THEME_CONTRACT.md is the source of truth for class names, data attributes
  and CSS variables. Never rename a part without bumping the contract version and
  updating the doc in the same change.
- One playback source active at a time. Never build a mixed queue.

## Content
- Never generate displayed text. UI strings come from docs/COPY.md; missing
  strings render as "[NEEDS COPY]".
- Fixtures live only in /dev/fixtures, are obviously synthetic, and must be
  excluded from production builds.
- Styling/layout tasks never change copy, names or data.
- Artwork: never blur, crop, overlay, animate, or place controls over it.
  Radius 4px.

## Process
- Before coding: list files to touch, the acceptance check, the verification
  command.
- After coding: report which checks you actually ran, with output. Never say
  "works" or "done" for anything you didn't run. Visual work = "ready for review".
- Same failure twice: stop and write a diagnosis before retrying.
- Only a Windows machine is available. Mark macOS code "untested" until
  verified on a real Mac.
- Log every surprise or doc conflict in docs/DECISIONS.md.
```

---

## 9. Parking lot (not v1)

- Apple Music, YouTube Music, local files, Linux
- Spotify Web API features (like/save, queue, search) — only with Premium and the 5-user dev cap
- SoundCloud API features (search, logged-in likes) — needs Artist Pro
- Audio visualiser — no clean audio source: Spotify's stream isn't accessible, the SoundCloud iframe is cross-origin. Windows system-audio loopback is possible but a separate project.
- Lyrics
- Theme sharing / marketplace
- Notarised or store distribution
- In-app CSS editor (CodeMirror panel)

---

## 10. Open questions (answer before Phase 1)

1. Do you have regular access to a Mac? Determines whether Phase 7 exists.
2. Fixture policy: synthetic strings (recommended) or real metadata you supply?
3. Tagline — draft above, yours to finalize.
4. Spotify Premium — only matters if Web API features ever come back.
5. Windows any-app mode (show any media session, not only Spotify)?
6. SoundCloud in the finished scope? Test first: does SoundCloud in Chrome appear in the S2 GSMTC spike with title + artwork?

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
