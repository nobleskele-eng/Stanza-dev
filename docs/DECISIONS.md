# Stanza — Decisions Log

Running log of decisions made and surprises hit during implementation, beyond what's
already captured in `docs/PLAN.md` (Sections 1 and 2). Append entries chronologically;
don't rewrite history here.

Format per entry:
```
## YYYY-MM-DD — Short title
What happened / what we assumed vs what was true.
Decision or resolution.
```

---

## 2026-09-16 — Phase 0 scaffold

- `npm create tauri-app@latest ... -f .` scaffolding into a non-empty repo root
  deleted the existing `docs/` folder (including `PLAN.md`) even though it only
  wrote frontend/tauri files. Recovered via `git restore` since both files were
  already committed. **Lesson:** commit any hand-authored docs before running
  scaffolding tools with `--force` into an existing directory, and diff
  afterward instead of assuming only new files were added.
- Rust was not installed on the dev machine; installed via
  `winget install Rustlang.Rustup`. MSVC Build Tools (C++ workload) also
  missing; installed via
  `winget install Microsoft.VisualStudio.2022.BuildTools` with the
  `Microsoft.VisualStudio.Workload.VCTools` component. Both are one-time
  machine setup, not project config.

## 2026-09-16 — Phase 1 / S1 window spike (passed)

- Frameless/transparent/always-on-top window: `decorations: false`,
  `transparent: true`, `alwaysOnTop: true`, `shadow: false` (native shadow off
  per D11/C9) in `tauri.conf.json`, window sized 360×96 to match the
  mini-player footprint from the theme.json shape in PLAN.md §4.
- Custom drag handler per C8: `mousedown` on `.mp-root` calls
  `getCurrentWindow().startDragging()` unless the click target is inside
  `button, input, a, [data-no-drag]`. Required adding the
  `core:window:allow-start-dragging` permission to
  `src-tauri/capabilities/default.json` — without it `startDragging()` fails
  silently at the IPC layer (no console error), worth remembering for S2/S3
  when adding more window/media permissions.
- CSS-drawn rounded corners (16px) + box-shadow on a dark pill inside a fully
  transparent `.mp-root`/`html`/`body` — no native window shadow, no native
  rounding, matches the "opaque-rectangle fallback must still look
  intentional" design rule (C6) since the pill itself is opaque even though
  the window frame is transparent.
- **Gate result: PASS.** Verified in `npm run tauri dev` and in the installed
  NSIS build (`tauri-app_0.1.0_x64-setup.exe`) — no white flash on show, drag
  is smooth, buttons remain clickable and don't trigger a drag. Confirmed
  visually by the user on both.
- Spike lives on branch `spike/s1-window`; not yet merged to `main` pending
  the rest of Phase 1 per PLAN.md §5 ("Spikes stay on throwaway branches...
  Merge the learnings into DECISIONS.md, not the code").

## 2026-09-16 — Phase 1 / S2 GSMTC spike (passed)

- Read Spotify's now-playing session via the `windows` crate
  (`Windows.Media.Control` WinRT namespace): title, artist, album, thumbnail
  (as a base64 data URL, sniffed PNG vs JPEG from magic bytes), interpolatable
  timeline (position/end in 100ns units, converted to ms), playback status,
  and — resolving two `?` cells in PLAN.md's capability matrix — shuffle
  (`PlaybackInfo.IsShuffleActive`) and seek (`Controls.IsPlaybackPositionEnabled`,
  and `TryChangePlaybackPositionAsync` actually works) are both available on
  Windows GSMTC. Repeat mode read via `PlaybackInfo.AutoRepeatMode`.
- Per D5: never hardcode the Spotify AUMID. Logged every session's
  `SourceAppUserModelId` on discovery (`eprintln!`) and filtered
  case-insensitively for `"spotify"` in the string. On this machine (installer
  build, not Store) the AUMID is literally `Spotify.exe` — simpler than
  expected, but per PLAN.md don't assume this matches the Microsoft Store
  build; that needs its own check if/when that build is tested.
- WinRT session/manager objects needed `RoInitialize(RO_INIT_MULTITHREADED)`
  on the background thread before calling `SessionManager::RequestAsync()` —
  omitting it either panics or silently fails depending on timing. Ran the
  whole GSMTC listener on a dedicated `std::thread` that blocks forever
  (`loop { sleep }`) to keep the WinRT event-handler registrations alive;
  Tauri's async runtime wasn't involved at all since `windows`-crate
  `IAsyncOperation::get()` blocks synchronously.
- Custom Tauri commands (`gsmtc_snapshot`, `gsmtc_play_pause`, etc.) needed
  **no** capability/ACL entry to be invokable — unlike core/plugin
  permissions (S1's `core:window:allow-start-dragging`), app-defined
  `#[tauri::command]` functions registered via `generate_handler!` are
  reachable by default. Worth remembering: don't assume every `invoke()` needs
  a capabilities.json entry.
- **UI bug, not a GSMTC issue:** a flex child (`.mp-debug`, showing the raw
  JSON snapshot) with `flex: 1` grew past its flex basis instead of shrinking
  to fit, pushing the control buttons below the window's visible bounds with
  no scrollbar — the classic flexbox "min-height: auto" trap (a flex item's
  default min-size is its content size, not 0). `min-height: 0` on the flex
  child is the usual fix, but here we just switched the debug panel to a
  fixed `max-height` + `overflow: auto` instead of relying on flex-shrink
  math, which is more robust for a panel showing dynamically-sized content
  (a base64 thumbnail can be tens of KB as one unbroken line).
- **Gate result: PASS.** 20 consecutive track changes in real Spotify, all
  metadata correct (title/artist/album/thumbnail), confirmed by the user.
  Prev/play-pause/next/seek(+10s)/shuffle buttons in the spike UI all
  control the real Spotify session.
- Spike lives on branch `spike/s2-gsmtc`; not merged to `main`, same as S1.

## 2026-09-17 — D14: customization as three layers

- Confirmed customization is the core purpose of the project, not a bolt-on
  feature. Recorded as **D14** in PLAN.md §1: three layers — (a) an in-app
  customizer that edits theme tokens and saves the result as a variant,
  (b) user CSS snippets layered on top of the active theme, (c) importable
  theme packages (`.zip`). Full spec lives in PLAN.md §4 "Customization
  layers" and the corresponding additions to `docs/THEME_CONTRACT.md`
  (layouts/controls schema, `data-hide-*`, the grid-child rule, the
  `@layer guard, theme, user` cascade, and a Snippets section).
- Safety model spans all three layers: Tauri CSP restricts style/font/image
  loading to the app and the asset protocol (plus `data:` for artwork) — no
  remote `url()` or `@import` anywhere, including in user snippets. The
  `guard` CSS layer holds `!important` rules that keep `.mp-source-badge`
  visible/opaque and artwork unmodified no matter what a theme or snippet
  does. User CSS, snippets and variants apply only to the player window,
  never settings. Tray item "Reset appearance" disables all snippets/variants
  and restores the default theme. No in-app code editor in v1 (parking lot).
- Added a "Definition of done (before any promotion)" section to PLAN.md
  (now §6): T1–T4 pass the fixture matrix, all three customization layers
  complete per §4, Phase 5/6 gates passed, README + theme authoring guide,
  a 3–5 tester private beta (Win10/Win11, display scaling, Spotify installer
  vs Store build), macOS marked untested post-launch. This is the gate for
  calling v1 "done," separate from each phase's own gate.
- Bumped Phase 3 (+3–5 h) and Phase 4 (+11–23 h) estimates in PLAN.md §5 to
  cover the new contract surface and the customizer/snippet/package UI; total
  moved from ~60–94 h to ~74–122 h, still a rough estimate.
- Recorded as D14 in PLAN.md; not yet implemented — no code exists for any of
  the three layers yet. This entry exists so Phase 3/4 work has a fixed
  target instead of being designed ad hoc when we get there.

## 2026-09-17 — D15: v1 scope narrowed to Spotify-only; open questions answered

- Went through PLAN.md §10's open questions:
  1. Mac access — it's a **school-regulated MacBook**, not a personal machine.
     Take Phase 7 (macOS) as lower-confidence until actually tested: school
     device management may restrict code signing, dev tool installation, or
     the automation permissions AppleScript needs (C5).
  2. Fixture policy — still open, no decision made.
  3. Tagline — still open, yours to finalize.
  4. Spotify Premium — confirmed, you have it. Relevant only if Web API
     features (D7) ever come back into scope.
  5. Windows any-app mode (show any active media session, not only Spotify)
     — confirmed you want this.
  6. SoundCloud in the finished scope — you asked to put it on the backseat
     until Spotify-only v1 ships.
- Decisions 5 and 6 together produced **D15** in PLAN.md §1: v1 ships
  Spotify-only on Windows; SoundCloud support and Windows any-app mode are
  grouped into a "Post-v1 expansion" note at the end of PLAN.md §5, with no
  ordering between them decided yet.
- Changed as a result: PLAN.md §0 scope line now states v1 is Spotify-only;
  Phase 1's **S3 SoundCloud widget spike is marked deferred/optional** — it's
  no longer required to unblock Phase 2, since D9's source-switching
  architecture and D6's Widget API choice don't need validating until the
  post-v1 expansion phase actually starts.
- Explicitly *not* changed: hour estimates and phase numbering in §5 (kept
  as a light-touch update — full phase restructuring for SoundCloud can wait
  until it's actually being scheduled). D6 (SoundCloud via Widget API) and
  D9 (one playback source at a time) remain valid technical decisions for
  whenever that phase starts; only the timing moved.

## 2026-09-17 — Phase 1 / S4 themes spike (passed, after two implementation bugs)

- **Asset protocol + CSP:** `tauri.conf.json`'s `app.security.assetProtocol.scope`
  needs an absolute path with no `..` components and no Windows `\\?\`
  extended-length prefix — a Rust `spike_theme_dir` command that built the path via
  `.join("..")` (literal `..` in the string) or `.canonicalize()` (adds `\\?\` on
  Windows) both silently failed to match the scope glob, so the `<link>` never
  loaded and nothing crashed or errored — just no visible effect. Fixed with
  `Path::parent()` instead of `.join("..")`, and no canonicalize. Also needed the
  `protocol-asset` Cargo feature on the `tauri` dependency (`cargo check` fails
  with a clear message pointing at this if it's missing — the assetProtocol config
  alone isn't enough).
- **CSP restricting style/font/img to `self`/`asset:`/`data:`** works, confirmed by
  a blocked-image console error and zero network attempts for a remote `url()` —
  but **only in a release build** (`npm run tauri build`, or the plain release exe
  at `target/release/tauri-app.exe`). In `tauri dev` with an external `devUrl`
  (Vite), Tauri does not inject CSP into the dev server's response at all, so
  nothing is blocked and no `securitypolicyviolation` event fires. This is the
  same shape as S1's dev-vs-bundle gap for window transparency — **any CSP-related
  gate must be verified in a release/bundled build, never `tauri dev` alone.**
- **Cascade layers (`@layer guard, theme, user;`) — first implementation attempt
  was wrong and is a trap worth flagging for Phase 3/4.** Loading guard/theme/user
  each as its own `<link rel="stylesheet" href="..." layer="name">` tag worked
  correctly on a page's *first* load (guard's `!important` beat a hostile
  snippet's `!important`, per spec — earlier-declared layers win ties on
  `!important`), but **flipped to "last layer wins" once any layer got registered
  dynamically after initial page load** — reproduced in a plain, Tauri-free HTML
  page in this WebView2/Chromium build (153.0.4234.32), so it's a browser/engine
  quirk, not an app bug. **Fix:** build one shell stylesheet with
  `@layer guard, theme, user; @import url(...) layer(guard); @import url(...) layer(theme); @import url(...) layer(user);`
  as a single `blob:` URL and swap that one `<link>`, instead of three separate
  layered links. This is what PLAN.md §4 already specified ("Load order via
  cascade layers... Implementation detail... decided in the S4 spike") — the
  spike now confirms the single-shell form is the one that's actually reliable,
  not an equally-valid alternative. Needed `blob:` added to CSP `style-src`.
  Cost: swapping the single shell link causes a brief unstyled flash between
  unload and reload, worse than the (broken) three-link version's flicker-free
  swap — Phase 4 should keep both old and new shell links live and remove the
  old one only after the new one's `onload` fires, to get reliability without
  the flash.
- **Hot swap:** editing a theme file on disk while `tauri dev` runs reliably
  fires the Rust `notify`-based file watcher and reaches the frontend via a
  Tauri event; cache-busting the shell link's blob content (not just a query
  string, since blob URLs are content-addressed) picks up changes in the
  `@import`-ed files too, not just the top-level shell.
- **Malformed CSS:** confirmed — a broken `theme.css` (missing colons/semicolons)
  doesn't crash the app or the webview; the browser just drops the unparseable
  declarations, per normal CSS error recovery. No special handling needed beyond
  what CSS already does, though Phase 3/4 should still surface a "theme failed to
  validate" state at the `theme.json`-schema level (separate from raw CSS parse
  errors, which are silent by design).
- **System font enumeration from Rust — resolves PLAN.md's "untested" flag:**
  `font-kit = "0.14"`, `SystemSource::new().all_families()`, works from a Tauri
  command with no special permissions; returned 183 families on this machine.
- Spike lives on branch `spike/s4-themes`, not merged to `main`, same as S1/S2.
  The font file used to verify local `@font-face` loading (a copy of Windows'
  `consola.ttf`) was deliberately *not* committed — proprietary system font,
  only needed locally to see the swap happen.
- **Checkpoint per PLAN.md §5: S1, S2 and S4 have all passed** (S3 SoundCloud
  remains deferred per D15). Phase 2 (Core) can start next.

## 2026-09-17 — Phase 2 / Core

- Built `NowPlaying`/`Capabilities`/`SourceId` types, the `PlayerAdapter`
  interface, and `PlayerStore` (src/store/playerStore.ts) with a pure
  `interpolatePositionMs()` (C10) and `switchSource()` that enforces D9 —
  disconnects the previous adapter before connecting the next, and drops any
  update from a non-active adapter even if it fires late. 10 Vitest unit tests
  cover interpolation edge cases and the switching guarantees; nothing existed
  yet, so Vitest itself was added this phase.
- Mock adapter + a synthetic fixture matrix subset in `/dev/fixtures`
  (CLAUDE.md: obviously synthetic, excluded from production builds). Actually
  verified the exclusion empirically rather than assuming it —
  `scripts/check-fixtures-excluded.mjs` greps `dist/` for a fixture marker
  string and fails the build if found; confirmed clean on a real
  `npm run build`. The mechanism is a plain `if (import.meta.env.DEV)` branch
  in App.tsx around a static import — esbuild inlines the env check and
  Rollup tree-shakes the dead branch (including the DevHarness/fixtures
  import) in production builds.
- `tauri-plugin-window-state` added for remembered window position. Deferred:
  persisting "last source" and "theme" — v1 is Spotify-only (D15) so source
  is currently constant, and there's no theme system yet; persisting state
  that can't vary yet would be speculative.
- Deferred: the "switch sources 10×, never hear both at once" manual gate.
  Only one real source category (Spotify) exists so far — no live second
  source to switch to yet. Covered instead by the unit tests, which simulate
  two adapters. Needs a real manual pass once GSMTC and/or SoundCloud land.

## 2026-09-17/18 — Phase 3 / Design system + default theme (in progress)

- T1 direction approved before any code, per PLAN.md's own per-theme process
  (4–6 hex values, type roles, one memorable thing, checked against generic
  defaults): near-black bg (`#0b0b0d`) + off-white fg (`#f2f0ea`) + one
  ink-red accent (`#c1432e`), slab-serif title over monospace metadata/time,
  artwork reduced to a small square accent (never the focal point, per T1's
  spec). Memorable thing: title/artist reflow in on track change instead of
  crossfading. Visual/typographic polish explicitly deferred — this is a
  first real pass, expected to iterate, not the final word.
- Built ONE contract-compliant DOM (`src/player/Player.tsx`) shared by all
  three layouts — `data-layout` picks pill/card/strip via CSS
  `grid-template-areas` in `src/theme/structure.css`, not three separate
  component trees. Structural concerns (grid placement, `data-hide-<part>`,
  focus-visible baseline, `prefers-reduced-motion`) live in structure.css;
  colors/fonts/motion are theme-authored (`themes/t1-default/theme.css`).
  `src/theme/guard.css` holds the D10/C3 protections (badge always visible,
  artwork never blurred/animated/radius-changed).
- Scope trim from the S4-spike theme-loading machinery: T1 loads as a normal
  bundled stylesheet (static `import` in App.tsx), not through the dynamic
  runtime `@layer`+blob-URL hot-swap system built during S4. That system is
  explicitly Phase 4's job (theme picker, hot swap between multiple themes,
  user theme folder). Phase 3 only needs T1 to render; the cascade-layer
  ordering itself (`@layer guard, theme;`) is still exercised via two plain
  `<link>`/`import` statements in the right order.
- Added `.mp-volume-wrap` as a new contract part, not originally in the Parts
  list. A rotated `<input type="range">` needs a non-rotated ancestor to
  reserve its final on-screen grid footprint, since `transform` doesn't
  affect layout size. Grid placement and `data-hide-volume` target the
  wrapper now, not `.mp-volume` directly. Documented in THEME_CONTRACT.md.
- **Volume slider took three real dead ends before landing on a working
  approach** — worth remembering for any other rotated/custom range input:
  1. `<input>` styled with `writing-mode: vertical-lr` + `-webkit-appearance:
     slider-vertical` together — these don't compose. `slider-vertical`
     forces native OS vertical-slider chrome, which rendered underneath the
     custom `::-webkit-slider-thumb` override, producing a broken double
     appearance (visible in-app, not caught by any automated check since
     this is pure rendering).
  2. `writing-mode: vertical-lr` alone with `appearance: none` — the
     declared `width`/`height` didn't take effect as expected (rendered as
     a wide box, not the declared thin track); root cause not conclusively
     identified (no devtools access to the native Tauri webview).
  3. **Working approach:** style as an ordinary *horizontal* slider (full,
     unambiguous control over track/thumb — no orientation-specific
     quirks), then `transform: rotate(-90deg)` the whole element inside a
     non-rotated `.mp-volume-wrap` that reserves the final footprint. This
     is the standard cross-engine technique for vertical range inputs and
     is what should be reached for first next time, not last.
  - Thumb/track cross-axis centering needed the standard WebKit formula
    `margin-top: calc((track-height - thumb-height) / 2)`. Removed it once
    on weak evidence (a screenshot where an unrelated input-height mismatch
    was the more likely cause), which made things worse; restored after
    confirming via an isolated repro (in a real browser tab, not the Tauri
    window) that the `::-webkit-slider-thumb` selector does apply — an
    oversized/bright test thumb rendered visibly, proving the pseudo-element
    styling itself works and isn't the source of any remaining misalignment.
  - **Known open rough edge:** sub-pixel thumb/track visual alignment on the
    volume slider may still be slightly off. Explicitly parked per the
    user's own guidance that typographic/visual polish is a later pass, not
    a Phase 3 blocker. Revisit with real devtools access to the rendered
    control (native Tauri window has none available to this session) before
    the Phase 3 gate's final sign-off.
- **Not yet done, remaining for Phase 3 to actually pass its gate:**
  Playwright setup + fixture-matrix screenshots (Chromium + WebKit), WCAG AA
  contrast check on `--mp-art-fg`, variant data model + validation unit
  tests, T2/T3/T4 stay placeholder-only (correctly, per PLAN.md — only T1 is
  required this phase). THEME_CONTRACT.md TODOs are still open.

## 2026-09-20 — Phase 3 / fixture matrix + contrast check

- Added Playwright (`@playwright/test`, Chromium + WebKit) and `e2e/matrix.spec.ts`:
  every fixture rendered through a URL-driven `?fixture=&layout=` mode in
  `src/dev/DevHarness.tsx` (static position, no store, so output is
  deterministic), screenshotted to gitignored `e2e/screenshots/<browser>/`, with
  a WCAG AA (4.5:1) check on every text part's computed color vs `.mp-window`'s
  background, plus a no-console-error check and a "source badge visible" check
  (D10). Runs against the Vite dev server — fixtures only exist in DEV builds.
  Only the **strip** layout is exercised: T1 styles strip only, pill/card are
  structure-only placeholders until Phase 4.
- Fixture matrix gained the rows PLAN.md §4 listed but were missing: each
  capability off individually (seek/volume/shuffle/repeat/album) and very
  light / very dark artwork (flat-colour synthetic SVG data URLs, carrying the
  FIXTURE-ONLY marker in an SVG comment).
- **The contrast check found two real T1 failures on its first run (32/32
  tests failing):** `.mp-source-badge` text (`--mp-accent` #c1432e on #0b0b0d)
  was 3.85:1, and `.mp-time-current/-total` (#6f6b64) was 3.71:1. Fixed inside
  the already-approved palette: time text now uses `--mp-muted` (6.67:1);
  badge text is `color-mix(accent 80%, fg)` (5.21:1); the raw accent is
  unchanged on the progress fill and badge border. **Visual change — ready for
  review, not signed off.**
- Second failure mode, not a theme bug: browsers report `color-mix()` results
  in computed style as `color(srgb r g b)` (channels 0–1), which my first
  `parseColor` rejected. Extended `src/theme/contrast.ts` + a test.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 23 passed;
  `npx playwright test` 32 passed (16 fixtures × Chromium/WebKit);
  `npm run build` OK incl. `check-fixtures-excluded: OK`.
- **Surprises found by looking at the screenshots (not fixed, need a decision):**
  1. **CLAUDE.md violation from the earlier Phase 3 pass:** `Player.tsx`
     hardcodes displayed strings — "Nothing playing", "Something went wrong",
     "Open", the button aria-labels, and the source badge is generated via
     `source.toUpperCase()`. docs/COPY.md has all of these as `[NEEDS COPY]`, so
     per the rules they should render `[NEEDS COPY]`. Not changed here because
     it alters everything displayed (including the badge wording, which has
     attribution implications, PLAN.md C3/C13).
  2. **Control glyphs render as colour emoji in WebKit** (⏮ ⏸ ⏭ become blue
     emoji tiles) and with a tint in Chromium — the buttons use Unicode
     characters. PLAN.md §0 says control icons are SVG/CSS; T1 should use inline
     SVG icons. Cross-engine difference caught only because of the WebKit run.
  3. **Volume slider:** a faint lighter rectangle is visible beside/below the
     rotated slider in WebKit (and faintly in Chromium) — probably the rotated
     input's unrotated box or default range-input chrome. This is the known
     open rough edge from the Phase 3 volume-slider entry; now reproducible
     without the native window.
- **Still open for the Phase 3 gate:** variant data model + validation unit
  tests; `--mp-art-*` palette extraction doesn't exist yet, so "text on
  `--mp-art-fg` meets AA" can't be tested (only static theme colors are);
  THEME_CONTRACT.md TODOs; keyboard-focus check; visual sign-off.

## 2026-09-20 — Phase 3 / scaffold CSS leak, SVG icons (root cause of the volume-slider dead ends)

- **Root cause found for the volume-slider rough edge — and for "dead end #2"
  in the 2026-09-17/18 entry ("declared width/height didn't take effect").**
  `src/App.css` still held the Tauri scaffold's global rules
  `input, button { padding: 0.6em 1.2em; border; border-radius: 8px;
  box-shadow: 0 2px 2px rgba(0,0,0,.2); background; }` (+ `button:hover`,
  `:active`, `outline: none`, a dark-mode variant, and global `a`/`h1`). They
  applied to every control in the player: `padding` on a `content-box` range
  input turned the declared 44×10 into 82×29 (measured with
  `getBoundingClientRect`: rotated box 31×84 → 10×44 after the fix), and the
  `box-shadow` was the "faint rectangle" beside the slider and the dark blobs
  behind the transport glyphs. Devtools weren't needed — a Playwright probe
  reading computed styles found it in one call. **Lesson: when a declared size
  "doesn't apply", read `getComputedStyle` before theorising about the engine.**
- Fix: `App.css` reduced to the `:root` page defaults; all scaffold
  `a/input/button/h1/.logo/.container/.row/#greet-input` rules deleted (nothing
  referenced them).
- Transport icons are now inline SVG (`src/player/icons.tsx`), `currentColor`,
  1em — identical in Chromium and WebKit (previously colour emoji in WebKit).
  aria-labels untouched (copy question is still open, see previous entry).
  Documented in THEME_CONTRACT.md; not a version bump.
- Added `e2e/focus.spec.ts`: Tab order prev → play → next → volume, each with a
  non-`none` computed outline. Closes the "visible keyboard focus" gate item.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 23 passed;
  `npx playwright test` 34 passed (32 matrix + 2 focus, Chromium + WebKit).
  Visual result: **ready for review**, not signed off.
- **New surprise, not fixed (needs your call):** nothing in the current code
  sets `html/body` background to transparent (the S1 spike did). `App.css`'s
  `:root { background-color: #f6f6f6 }` would paint an opaque light-grey
  rectangle behind the rounded player in the real transparent Tauri window.
  I can't see the native window from this session, so this is unverified —
  check it in `tauri dev`; if the corners show grey, the fix is
  `html, body, #root { background: transparent }` for the production path.

## 2026-09-20 — Phase 3 / variant data model + validation

- `src/theme/variant.ts` (+ 31 tests in `variant.test.ts`): `Variant`,
  `ThemeManifest`, `validateValue`, `validateVariant`, `emptyVariant`,
  `variantToDom`, `checkVariantContrast`. Rules are exactly PLAN.md §4 / D14,
  written up in THEME_CONTRACT.md "Variants" (not a version bump).
- **Failures are machine codes + a path, never prose.** COPY.md's "Variant
  import error" is `[NEEDS COPY]` and CLAUDE.md forbids generated displayed
  text, so a validator that produced messages would have broken the rule. The
  UI maps codes to copy once it exists.
- Hardened beyond the plan's `url( ; { }` list: backslash (CSS escape can spell
  `u\72l(`), `@`, `/*`, `<`, `>`, `image-set`, `expression(`, control chars.
  Colours are hex/`rgb()` only (no named colours, no `var()`, no `hsl()`), so
  every accepted colour is also parseable by the contrast check.
- Two design calls worth knowing: (1) control characters are checked on the
  *untrimmed* value — my first version trimmed first, and a test caught a
  trailing newline being silently normalized away; (2) partial import: bad
  entries are dropped and reported while good ones apply, but a wrong
  theme/contract/layout rejects the whole file.
- **Tooling surprises:** (a) Vitest returns an empty string for `?raw` CSS
  imports unless `test.css.include` matches the file — set for
  `structure.css` in `vitest.config.ts`; the first run of the sync test "passed
  the wrong way" by comparing against `[]`, so check such tests fail when the
  input is broken. (b) `@types/node` isn't installed and `npm run build`
  typechecks test files, so tests use Vite `?raw`/JSON imports, not `node:fs`.
  (c) My own file-writing path converted `\u0000` escapes into raw control
  bytes in two source files (grep then called them binary). Fixed with
  explicit code-point checks; both files verified free of control bytes.
- Verified the tests bite: temporarily removing `;` from the forbidden set made
  the injection test fail; restored.
- `HIDEABLE_PARTS` is tested against the `data-hide-<part>` selectors in
  `structure.css`, so the two can't drift apart silently.
- Not done: nothing applies a variant to the DOM yet (`variantToDom` is the pure
  mapping; wiring, the customizer UI and file storage are Phase 4). Player
  doesn't take a variant.

## 2026-09-20 — Phase 3 / strings from COPY.md; page background; `main` window is still the scaffold

- **CLAUDE.md violation fixed.** `Player.tsx` no longer contains any display
  string. `src/copy.ts` parses `docs/COPY.md` (`- **Label:** value`); a value
  that is empty or still starts with `[NEEDS COPY]` is treated as missing —
  including entries that carry a *draft* after it, because a draft is not
  approved copy. Missing → literal `[NEEDS COPY]`. Covers the idle text,
  generic-error fallback, source badge, prev/play/pause/next/volume labels
  (aria-labels count as UI strings) and the link-out label. `source.toUpperCase()`
  was generated text and is gone. New labels were added to COPY.md as
  `[NEEDS COPY]` under "Player UI" — no wording was written by me.
  **Visible consequence:** until you write the copy, the idle state and the
  source badge read "[NEEDS COPY]", and the wider badge squeezes the title
  column in the strip layout (checked in screenshots; goes away with real copy).
  **Open for you:** the badge wording has attribution requirements (C3/C13).
- Tests: `copy.test.ts` (parser; missing/draft → `[NEEDS COPY]`; every label the
  code asks for exists in COPY.md — a typo would otherwise show `[NEEDS COPY]`
  forever; `copy()` only ever returns approved text or the placeholder) and
  `e2e/copy.spec.ts` (the rendered DOM says `[NEEDS COPY]`).
- **Grey-corner question settled by test, not by eye.** Wrote
  `e2e/production.spec.ts` first (production bundle via `vite preview`,
  screenshot with `omitBackground`, read the alpha of the pixel outside the
  rounded arc) and ran it against the old code: **red** — corner alpha 255 and
  `html` painting `rgb(246, 246, 246)`. So the concern was a real bug, not
  hypothetical. Fix: `App.css` no longer paints any page background
  (`html, body, #root { margin: 0; background: transparent }`); the dev harness
  and matrix cell set their own `#f6f6f6`. Now **green** in Chromium and WebKit.
  Second tooling note: WebKit here has no `OffscreenCanvas`; the test uses a
  normal canvas.
- **Surprise: `src-tauri/tauri.conf.json` on `main` is still the unmodified
  scaffold** — 800×600, decorated, no transparency, no always-on-top, `csp: null`.
  The frameless/transparent/always-on-top settings and the CSP/asset-protocol
  config only exist on the spike branches (by design: "merge learnings, not
  code"). So nothing has yet put the player in a transparent native window on
  `main`; and `tauri dev` renders the DEV harness, not the production player,
  so it was never a valid place to check corners. What is verified: the page
  paints nothing behind the player. What is **not** verified: the native
  transparent window itself — that needs the S1 window config applied (Phase 5
  app shell) and a look in the installed build (S1 showed dev and bundle can
  differ). Also unchanged and needing re-verification then: CSP must be set in
  `tauri.conf.json` (S4: only enforced in release builds).
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 60 passed;
  `npx playwright test` 44 passed (32 matrix + 2 focus + 6 copy + 4 production,
  Chromium + WebKit); `npm run build` OK incl. `check-fixtures-excluded: OK`.

## 2026-09-20 — Phase 3 / THEME_CONTRACT finalized (v1), audited against the real DOM

- Rewrote `docs/THEME_CONTRACT.md` as a complete v1 spec: Root attributes and Parts as
  one-per-line lists, per-state part table, `theme.json` field table (with what is
  *enforced* vs *planned*), shared DOM + one annotated example per layout, a "Not in v1"
  list, and honest status notes. **Not frozen** — it freezes at your Phase 3 sign-off;
  corrections that make it match the code are allowed until then (no version bump).
- `e2e/contract.spec.ts` parses the doc and compares it with the rendered DOM: Parts ==
  every `mp-*` class across the whole fixture matrix; Root list == every `data-*`
  attribute set (including hover); boolean `data-cap-*` are present-or-absent; theme.json
  `window` fits every state and is filled by the largest; strip has no auto-placed part;
  guard resists ordinary-declaration attacks. **Mutation-checked**: deleting a doc bullet,
  the strip placement rule, one guard property, or shrinking `window.height` each makes
  exactly the matching test fail (files restored afterwards).
- **What the audit found (all fixed unless noted):**
  1. `data-hover` was in the contract but nothing set it → implemented on `.mp-root`
     (pointer only; keyboard users need `:focus-within`, stated in the contract).
     T1 does not use it yet.
  2. **`theme.json` `window` was wrong**: 400×160 vs a rendered 400×202 in the tallest
     state (118–202 across states). Corrected to 400×202; now tested against every fixture.
  3. **`.mp-empty` / `.mp-error` / `.mp-link-out` had no grid placement even in `strip`**
     (auto-placed by accident). Now explicit; a test guards it.
  4. **`guard.css` didn't cover what the contract claimed**: only filter/animation/radius.
     Added opacity, transform, clip-path, mask, mix-blend-mode. **Still not a real
     guarantee:** guard is not yet inside `@layer guard`, so a later stylesheet's own
     `!important` on the same property can win. Contract says so; the layered loader is
     Phase 4 (S4 spike). Tested only against ordinary declarations.
  5. **`--mp-art-1..3` / `--mp-art-fg` are declared but nothing supplies them.** Contract
     now says so and requires fallbacks in themes.
  6. **Link-out was visibly broken (found from the screenshots, not by any assertion):** default
     blue underlined link on the dark card, not in the contrast check, and its text widened the
     auto artwork column, shoving the title right. Fixed: T1 styling, added to the AA check,
     and `width:0; min-width:100%` + ellipsis so it can never widen the column (its copy must
     be short — recorded in the contract).
- **Known gaps, deliberately not fixed:** `pill` and `card` are structural placeholders that
  place only some parts (contract lists exactly which); the rule "a theme must place every
  part it shows" is stated and is Phase 4 (T2/T3) work. No shuffle/repeat/seek controls
  exist in v1 even though `data-cap-shuffle/repeat/seek` are emitted — **open question for
  you**: freeze v1 without them, or add parts before freezing?
- PRIORITIZATION_PLAN.md's lyrics button and genre-based fonts are recorded under "Not in v1";
  `data-genre` / `--mp-font-genre` is only a candidate until spikes S6/S7 land.
- New: `npm run review` renders 2× images of every T1 state, the three layouts, hover and
  keyboard focus in Chromium and WebKit and builds labelled contact sheets in
  `e2e/review/` (gitignored). Visual result: **ready for review**.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 60 passed; `npx playwright test`
  98 passed (Chromium + WebKit); `npm run build` OK incl. `check-fixtures-excluded: OK`.

## 2026-09-22 — Answer to the open shuffle/repeat/seek question

Resolved the open question from the entry above: **freeze v1 without shuffle/repeat/seek
controls.** `data-cap-shuffle/repeat/seek` keep being emitted (a theme can still react to
them); adding the corresponding buttons/interactive progress bar is a contract version
bump, done later alongside whichever phase actually builds those controls. `docs/THEME_CONTRACT.md`
already stated this correctly under "Not in v1" — no doc change needed, just recording
the sign-off. The contract is not yet fully frozen: palette extraction (`--mp-art-1..3`/
`--mp-art-fg`), T2/T3 placing every part in `card`/`pill`, and visual sign-off on T1 are
still open per its own "Remaining before this contract can be frozen" checklist.
- **Result:** doc-only change, re-ran nothing new (see the entry above for the last full
  verification, still current).

## 2026-09-22 — T1 visual sign-off given

You reviewed the three `npm run review` contact sheets (states; capabilities/artwork;
layouts + hover/keyboard focus) and confirmed T1. Checked off in `docs/THEME_CONTRACT.md`'s
freeze checklist. Two items remain on that checklist: palette extraction for
`--mp-art-1..3`/`--mp-art-fg` (PLAN.md's Phase 3 gate includes "text on `--mp-art-fg` meets
WCAG AA 4.5:1", untested because nothing supplies real values yet — currently fallback
only), and T2/T3 placing every part in `card`/`pill`, which is explicitly Phase 4 work per
PLAN.md. So Phase 3 isn't fully gated closed until palette extraction lands or is
consciously deferred; Phase 4 (themes, switching, customizer UI) is the next body of work
either way.
- **Result:** doc-only change, no re-verification needed.

## 2026-09-22 — Phase 3 / palette extraction, client-side (JS/canvas, not Rust)

Closes the last open Phase 3 gate item: PLAN.md's "text on `--mp-art-fg` meets WCAG AA
4.5:1" is now testable and green.

**Deviation from PLAN.md, decided with you first:** PLAN.md's architecture section puts
palette extraction in a Rust `ArtworkService` ("no canvas CORS problems", since macOS
gives artwork as a remote URL). Built it in TypeScript instead: no real Spotify adapter
exists yet (`src-tauri` is still the scaffold `greet` command — GSMTC/AppleScript aren't
built), and the Phase 3 gate is tested via Playwright against the Vite dev server, not a
Tauri runtime. Windows GSMTC also hands Rust raw image bytes (not a URL), which can reach
the webview as a `data:` URL — no CORS issue for canvas on that path. Revisit Rust only if
a real macOS/AppleScript adapter's remote-URL artwork actually taints the canvas.

- `src/theme/palette.ts`: `extractPalette(imageData)` is a pure function (bucket pixels
  into a coarse 4-bit/channel color space, return the 3 most populous buckets' centroids
  as `art1/2/3`, most-common first; skip near-transparent pixels) so it's unit-testable
  without a real canvas. `extractPaletteFromImage`/`extractPaletteFromUrl` are the thin
  canvas/Image wrappers, browser-only, exercised by Playwright not vitest.
- **`art-fg` is provably always AA-compliant, not just usually:** chosen as whichever of
  pure white/black has higher contrast against `art1`. The worst-case background luminance
  (≈0.179, where white and black nearly tie) still yields ~4.58:1 — above the 4.5 floor.
  `palette.test.ts` proves this by sweeping the full lightness range plus several saturated
  colors, rather than trusting the one-line math.
- Wired into `Player.tsx`: a `useEffect` keyed on `track.artwork` calls
  `extractPaletteFromUrl` and sets `--mp-art-1..3`/`--mp-art-fg` on `.mp-root` inline
  (same mechanism as the existing `--mp-progress`). Clears to `null` immediately on track
  change so a new track never briefly shows the previous track's colors while its own
  artwork is still decoding. Resolves to `null` (vars left unset) on missing artwork, a
  failed image load, or a tainted canvas — themes already require a fallback for that case.
- `e2e/palette.spec.ts`: reads the computed `--mp-art-1`/`--mp-art-fg` off `.mp-root` for
  the two artwork-bearing fixtures (very light / very dark) after the async extraction
  settles, asserts AA, and asserts the vars are absent for a no-artwork fixture.
- `docs/THEME_CONTRACT.md`: marked `--mp-art-*` supplied (with the algorithm and the
  degrade-gracefully cases spelled out); checked off the freeze-checklist item.
- **No visible change to T1** — it's `colorMode: static` and doesn't reference `--mp-art-*`,
  so this is invisible until a future theme uses it. Not a "ready for review" item.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 67 passed (60 + 7 new
  `palette.test.ts`); `npx playwright test` 104 passed (98 + 6 new `palette.spec.ts`,
  Chromium + WebKit); `npm run build` OK incl. `check-fixtures-excluded: OK`.

## 2026-09-22 — Phase 4 / T2 "Glow Card" (artwork-forward, card layout)

First Phase 4 theme. Direction picked with you before any code (PLAN.md's own
pre-code checklist): cool near-black card (#101014/#f4f4f2/#85858c/#7c9eff — a
different hue family from T1's warm near-black + ink-red, so the two don't read as
variations on one theme), large square artwork, plain system sans title / uppercase
mono meta. **Memorable thing:** an ambient glow behind the card built from `box-shadow`
colored with `--mp-art-1`/`--mp-art-2` — the track's own extracted colors, never the
artwork's pixels — so each track tints its own card. This is the first real use of the
palette extraction shipped earlier today.

- **AA-safety design rule, applied throughout:** `--mp-art-1/2/3` are only ever used for
  *non-text* purposes (the glow, the progress fill, the badge border) or as a *background*
  paired with `--mp-art-fg` as the text/icon color on top of it (the play button — the one
  guaranteed-AA pairing). They are never used as arbitrary text color directly against the
  fixed `--mp-bg`, since only the `art1`/`art-fg` pairing itself is contrast-guaranteed —
  pairing an extracted color with a *different* fixed background has no such guarantee.
  This is why the full fixture matrix AA check passed on the first real run with no fixes
  needed, unlike T1's (DECISIONS.md 2026-09-20), which found two real failures.
- `src/theme/structure.css`: completed the `card` grid (previously a placeholder missing
  time/volume/link-out/empty/error) — same "every part gets an explicit grid-area" rule
  already applied to `strip`. `.mp-time-current`/`.mp-time-total` share one grid area with
  `justify-self: start`/`end`, same technique as `strip`.
- `themes/t2-artwork/`: `theme.json` (`window: 280×507`, measured the same way T1's was —
  guess high, run the fixture matrix, read the real max, lock it in) + `theme.css`.
- `docs/THEME_CONTRACT.md`: card's layout section rewritten from "placeholder until Phase 4"
  to a complete annotated example (mirroring `strip`'s); checked off "T2 places all parts in
  card" in the freeze checklist (T3/`pill` is still open, explicitly Phase 4).
- **Generalized the e2e suite** from T1-only to loop over both themes — `e2e/contract.spec.ts`'s
  window-fits and grid-placement tests, and `e2e/matrix.spec.ts`'s full fixture-matrix/AA
  check, now each run once per theme (`THEMES` array) instead of being hardcoded to
  `t1-default`/`strip`. `e2e/review.spec.ts`/`scripts/review-sheet.mjs` likewise: state
  screenshots are now taken per layout (`state--strip--*` / `state--card--*`), with a new
  "T2 — artwork-forward / card" contact-sheet group.
- Wired `themes/t2-artwork/theme.css` into `src/App.tsx` alongside T1's — both load
  unconditionally (same as `structure.css`/`guard.css`); each theme's rules are scoped to
  its own `[data-layout="…"]` so they can't collide. This is a stand-in for real theme
  loading/switching (Rust file watcher, asset-protocol `<link>`, hot swap), which is later
  Phase 4 infrastructure work, not needed just to build and review a theme.
- **Visual result: ready for review** — sent as `sheet-3-t2-card.png` (all fixtures,
  Chromium + WebKit) and the updated `sheet-4-layouts-interaction.png`.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 67 passed (unchanged);
  `npx playwright test` 176 passed (104 + 72 new: 34 T2 matrix/AA × verified, T2
  window-fits + grid-placement, 34 T2 review-image captures, Chromium + WebKit);
  `npm run build` OK incl. `check-fixtures-excluded: OK`.

## 2026-09-22 — Phase 4 / T3 "Micro Pill" (compact, hover-reveal) — contract frozen

Third theme, and the last item on THEME_CONTRACT.md's own freeze checklist — **the
contract is now frozen.** Direction picked with you first: light palette (off-white
#f2f0ec / near-black #1a1a1a / warm accent #b5623a — deliberately not a third dark
theme). **Memorable thing:** the first theme to actually use `data-hover` — by default
only artwork, title, transport and the badge render at non-zero size; progress, time,
volume and link-out are placed (explicit `grid-area`, satisfying the contract) but
sized to `0px` via a CSS custom property, revealing on hover **or** `:focus-within`
(`data-hover` never fires for keyboard users — the contract has said so since Phase 3,
untested until now).

- **AA hazard found and designed around, not just discovered after the fact:** by hand
  (not by the automated check, ahead of writing any CSS) I confirmed `--mp-accent`
  (#b5623a) sits at a luminance where *neither* this theme's own near-black nor its own
  off-white clears WCAG AA against it as a background — only *pure* `#fff`/`#000` has
  the universal guarantee `palette.ts` relies on (T2's case); a fixed, non-extracted
  accent has no such guarantee. So `--mp-accent` is used only decoratively here (the
  progress fill, never text), and the play button reuses the theme's own fg/bg pair
  instead. The full fixture-matrix AA check passed on the first real run, same as T2.
- `themes/t3-pill/`: fully overrides `structure.css`'s pill placeholder rather than
  building on it (the documented pattern) — 3 grid rows, `--t3-extra` custom property
  toggling `0px` ↔ `auto` on the two collapsible rows.
- **`e2e/contract.spec.ts`'s window-fit test now hovers before measuring, for every
  theme** — needed because T3's height genuinely changes on hover and the native window
  can't resize itself, so the fixed `window` size must already fit the expanded state.
  A no-op for T1/T2 (they don't change size on hover), confirmed by their tests still
  passing unchanged.
- **Real cross-engine variance found while sizing the window, and reasoned through
  rather than papered over:** Chromium's and WebKit's measured heights differed by
  several px on T3's tiny (7–9px) hover-revealed text — genuine font-metric variance
  (PLAN.md already documents WebKit here as "not identical to WKWebView, still needs
  the real-Mac pass"), not a bug; no single window height could satisfy both engines'
  own maximum within the previous ±1px "filled by the largest state" tolerance. Split
  the check: the ceiling ("fits within") stays at ±1px on both engines — overflowing
  the native window is a real bug regardless of engine — but "how snugly the largest
  state fills it" now tolerates ±8px (`FILL_TOLERANCE` in `contract.spec.ts`), applied
  to all themes, not just T3. T1/T2 still pass (loosening a lower bound can't break an
  already-passing case).
- `docs/THEME_CONTRACT.md`: `pill`'s layout section rewritten from "placeholder until
  Phase 4" to a complete annotated example; checked off "T3 places all parts in pill" —
  **every item on the freeze checklist is now checked**, so the doc's status line is
  updated to "frozen." Flagging this rather than deciding it silently: T2/T3's own
  visual sign-off (as opposed to T1's, which the checklist explicitly required) hasn't
  been asked for separately — worth confirming you're fine with contract-freeze
  happening on this basis.
- **Visual result: ready for review** — sent as `sheet-4-t3-pill.png` (all fixtures,
  collapsed state, Chromium + WebKit) and the updated `sheet-5-layouts-interaction.png`
  (now includes a collapsed/expanded pill pair).
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 67 passed (unchanged);
  `npx playwright test` 248 passed (176 + 72 new: 34 T3 matrix/AA, T3 window-fits +
  grid-placement, 34 T3 review-image captures, 2 new interaction captures, Chromium +
  WebKit); `npm run build` OK incl. `check-fixtures-excluded: OK`.

## 2026-09-22 — Contract v2: `data-theme`, ahead of building T4

Prerequisite discovered while starting T4, not planned in advance. T4's direction (your
choice, after narrowing from three pitched options) reuses the `card` layout — the first
time two themes share a layout. The current theme-loading stand-in (every theme's CSS
statically imported into `App.tsx` at once, scoped only by `[data-layout]`) has no way to
tell two same-layout themes' rules apart once both are loaded, so T2 and T4 would collide
and fight over the same elements.

**Two fixes considered:** (a) add `data-theme` to Root, a small contract bump, mechanical
to apply; (b) build real single-active-theme CSS loading now (a `<link href>` the dev
harness swaps, closer to PLAN.md's actual Rust-file-watcher design) — bigger, and pulls
forward "Phase 4 switching infrastructure" work that was deliberately deferred after T2.
Went with (a): smallest footprint, doesn't require standing up loading infrastructure
just to unblock a fourth theme file, and it's infrastructure the real theme picker will
need anyway (it has to know which theme is active). This is a judgment call, not a
creative one, so made and logged rather than asked.

- **Contract → v2.** `docs/THEME_CONTRACT.md`: added `data-theme` to **Root**, a
  Changelog section, updated the shared-DOM example and all three themes' annotated
  excerpts. Nothing renamed or removed — a pure addition, so v1's own "frozen" status
  isn't invalidated, v2 just supersedes it (documented explicitly rather than silently
  overwriting the freeze note).
- `src/player/Player.tsx`: new required `theme` prop → `data-theme` on `.mp-root`,
  alongside the existing `data-layout`.
- `src/dev/DevHarness.tsx`: `MatrixCell` reads `?theme=` (default `t1-default`);
  `FullHarness` gets a theme radio list that also drives `layout` (a theme has exactly
  one layout, so picking the theme picks the layout).
- `themes/{t1-default,t2-artwork,t3-pill}/theme.css`: every top-level selector gained
  `[data-theme="<id>"]` alongside `[data-layout="…"]` (mechanical, `sed`, then verified
  by the unchanged matrix/contract suites passing). `theme.json` `contract: 1 → 2` for
  all three, plus `src/theme/variant.ts`'s `CONTRACT_VERSION` — `variant.test.ts`'s
  fixtures were hardcoding the literal `1` as "the matching version" in several places;
  switched those to reference `CONTRACT_VERSION` so the next bump doesn't silently break
  them the same way.
- `e2e/{contract,matrix,review}.spec.ts`: `url()`/`open()` helpers and the `THEMES`
  arrays now thread a theme id through as `&theme=`, not just `&layout=`.
- **Verified nothing broke:** this was a mechanical, wide-reaching change (7 non-test
  source files, 3 theme CSS files, 3 spec files) — ran the full suite, not a subset, to
  be sure.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 67 passed (unchanged —
  variant tests still pass after switching their fixtures off the hardcoded `1`);
  `npx playwright test` 248 passed (unchanged count — this step only rescopes existing
  themes' CSS, adds no new themes or test cases yet); `npm run build` OK incl.
  `check-fixtures-excluded: OK`.

## 2026-09-22 — Phase 4 / T4 "Extreme" — full theme roster (T1–T4) complete

Fourth and last first-party theme. Direction narrowed with you across two rounds: first
three pitched concepts (brutalist strip / maximal collage card / kinetic marquee strip),
then you asked to mix two of them — settled on card layout (T2's), the collage's rotated
color-block frame, and the marquee's continuous scroll, dropping the diagonal stripe and
gradient text options. Palette: near-black #0a0a0a, white #ffffff, muted #9a8fa3, three
saturated accents (magenta #ff2e88, yellow #ffe100, cyan #00e0c6) — loud on purpose, and
deliberately a different combination from T1 (warm near-black + one red accent) and T2
(cool near-black + one blue accent): near-black + three primaries at once, not a fourth
variation on "dark card, one accent."

- **The two "memorable things":** (1) a rotated two-color block frame (magenta,
  yellow) stacked behind the artwork via `.mp-window::before`/`::after` at `z-index:
  -1`, allowed to peek past `.mp-window`'s own edges — deliberate, not a bug, since the
  native window is transparent (PLAN.md D11) so the overhang reads as a physical
  sticker against it. Pseudo-elements went on `.mp-window`, not `.mp-artwork`, because
  `::before`/`::after` don't render on `<img>` in any browser, and D10 forbids touching
  the artwork anyway. (2) a continuously looping marquee title (`translateX(100%)` →
  `translateX(-100%)`, `9s linear infinite`) instead of every other theme's quiet
  ellipsis truncation — plays even for short titles that already fit, deliberately,
  since this is the maximal theme, not a conditional one.
- **Reduced motion needed a real override, not just the app-wide clamp:** `structure.css`'s
  global `prefers-reduced-motion` rule sets `animation-duration: 0.001ms` on everything,
  which would leave a looping marquee snapped mid-sweep rather than legibly static.
  `t4-extreme/theme.css` adds its own `@media (prefers-reduced-motion: reduce)` block
  that cancels the animation/transform outright and falls back to the same static
  ellipsis truncation every other theme uses.
- Same AA-safety discipline as T2/T3: all three accents are used only decoratively (the
  frame, the progress fill, the badge border) or not at all as text-on-`--mp-bg` color;
  the play button reuses the theme's own fg/bg pair. Fixture-matrix AA check passed on
  the first run, same as T2 and T3 — three for three now.
- **Found and fixed a pre-existing, unrelated flaky margin while re-running the full
  suite:** T3's window height (80px, set 2026-09-22) failed once under WebKit on the
  CJK fixture — 81.45px measured against an 81px ceiling. Not caused by anything in
  this change; a second, independent source of variance (run-to-run font-metric
  jitter, on top of the already-documented engine-to-engine variance) that the
  previous `FILL_TOLERANCE = 8` hadn't accounted for. Raised T3's height to 84px and
  `FILL_TOLERANCE` to 12; reran `contract.spec.ts` with `--repeat-each=2` on both
  engines (56/56) to confirm the fix rather than trusting one clean run.
- **Visual result: ready for review** — sent as `sheet-5-t4-extreme.png` (all fixtures,
  static — the rotated frame shows, the marquee scroll and any motion don't, stills
  can't capture animation) and the updated `sheet-6-layouts-interaction.png`.
- **Definition of Done (PLAN.md §6) status:** "T1–T4 pass the fixture matrix" is now
  true — all four themes, all AA checks, all window-fit and grid-placement checks
  green. Everything else on that list (customization layers, Phase 5/6 gates, README,
  beta) is still open, and the real Spotify adapter still doesn't exist — this is not a
  release-ready v1, just the theme roster itself finished.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 67 passed (unchanged);
  `npx playwright test` 320 passed (248 + 72 new: 34 T4 matrix/AA, T4 window-fits +
  grid-placement, 34 T4 review-image captures, 2 new interaction captures, Chromium +
  WebKit) — full suite, plus a `--repeat-each=2` pass on `contract.spec.ts` for the T3
  fix; `npm run build` OK incl. `check-fixtures-excluded: OK`.

## 2026-09-22 — Two real bugs found by actually running the app, not by any automated check

You asked to run it locally. Started `npm run dev` + the built-in browser against the
DevHarness's theme selector and clicked through all four themes — both bugs below were
visible within the first minute of looking, and neither is anything the 320-test
Playwright/vitest suite catches, because neither is about color, text, or explicit grid
placement, the three things that suite actually asserts on.

- **T3's collapsed pill wasn't actually collapsed.** `mp-progress`/`mp-time-*`/
  `mp-volume-wrap` all have their own explicit CSS height (`height: 2px`, `height: 10px`,
  natural line-height) — a `0px` grid ROW does not clip an item with an explicit height;
  the item simply renders at its authored size and overlaps row 1, because CSS Grid
  tracks aren't scroll/clip containers. First fix attempt (`overflow: hidden` on
  `.mp-window`) wasn't sufficient either: the overlapping sliver sits right at row 1's
  own edge, still inside `.mp-window`'s small collapsed bounding box, so there was
  nothing past the edge to clip. Real fix: explicit `opacity: 0; pointer-events: none;`
  on the five collapsing parts by default, flipping to `opacity: 1` on `[data-hover]`/
  `:focus-within` (the same technique `.mp-artist` already used, which never had this
  bug because it isn't a grid item). `e2e/contract.spec.ts`'s grid-placement test never
  catches this class of bug — it only checks that `grid-column/row-start` isn't `"auto"`,
  nothing about whether the rendered box actually stays within its track.
- **T4's rotated frame — the theme's whole "memorable thing" — never rendered at all.**
  `.mp-window::before`/`::after` had `z-index: -1` but `.mp-window` itself had
  `position: relative` with no `z-index` of its own, so it never established a local
  stacking context — the `-1` was relative to some much higher ancestor, sending the
  frame to the bottom of nearly the whole page's paint order, not just behind the card.
  Fixed with `isolation: isolate` on `.mp-window`. The fixture-matrix screenshots taken
  for `sheet-5-t4-extreme.png` earlier today all silently show this broken (no visible
  frame) — worth a second look at that sheet now that it's fixed, next time it's
  regenerated. No test suite assertion touches z-index/stacking at all.
- **Why the suite missed both:** `matrix.spec.ts` asserts text-color contrast,
  `contract.spec.ts` asserts grid-area assignment (not track-vs-item size) and window
  bounding-box dimensions (not what's painted where inside it), `palette.test.ts`/
  `contrast.ts` are pure color math. Nothing anywhere renders a screenshot and diffs it
  against an expected image (the `e2e/review/` sheets are for human eyes, not asserted
  on) or checks computed stacking/paint order. This is a real gap, not just these two
  bugs' root cause — recorded here rather than silently patched, since it says something
  about what the suite can and can't catch going forward.
- Added `.claude/launch.json` (`npm run dev` on port 1420) so the Browser pane tool can
  start the dev server directly in future sessions.
- **Result (ran):** found via manual inspection in a real browser, not a test failure.
  After both fixes: `npx tsc --noEmit` clean; `npx vitest run` 67 passed; `npx playwright
  test` 320 passed, unchanged count (both fixes are CSS-only, no new test cases — the
  suite's blind spot here is the point of this entry); `npm run build` OK incl.
  `check-fixtures-excluded: OK`.

## 2026-09-22 — D10 relaxed: artwork crop/overlay/filter/animation now allowed (permanent default)

Prompted by feedback that the shipped four-theme roster (all passing the 320+67-test
fixture-matrix/AA/grid suite, contract frozen at v2) has "nothing cool/frontier/
boundary-pushing about it." Shown two references (a Portishead card using collaged
real track-text as background texture behind a square photo; a Lorde player with
artwork cropped to a circle and a scrubber riding its edge) and asked for layered
text, shape movement, depth, shadows.

**Scope, as decided across two rounds of questions:** redesign T1 only; T2/T3/T4
stay as-is. D10 relaxes as a **permanent project-wide default**, not a T1-only
exception — `guard.css` and the `@layer guard, theme, user` cascade apply to every
theme and every user snippet, not just T1.

**What changed, precisely, across both rounds:**
- Round 1 approved: `border-radius`/`clip-path` (crop into non-square shapes),
  overlaying text/graphics on top of the artwork, `filter` (blur/duotone on the
  artwork's own pixels).
- Round 2, on review of the guard-scope split, also approved: `animation`.
- Still prohibited, unchanged: interactive controls rendered on/over the artwork's
  bounding box. Never a guard-CSS-lockable property, only a documented convention —
  now enforced by a new Playwright bounding-box overlap check in
  `e2e/contract.spec.ts`, run per-theme, per-fixture, with hover applied first (T3's
  hover-revealed controls).
- Still guard-locked: `opacity`, `transform`, `mask`, `mix-blend-mode` on
  `.mp-artwork`.

**What this knowingly deviates from — not glossed over:** D10's original reason
(PLAN.md §1, C3, C13) was Spotify's Design Guidelines forbidding crop/blur/overlay/
animation of artwork, and (by extension, ambiguously) SoundCloud's terms against
modifying User Content. C3's own resolution note already anticipated this exact
tension: *"Comply anyway — it's cheap, and anyone reviewing your portfolio who
knows the rules will spot a blurred-artwork background."* Flagged to the user
twice, across two separate rounds of questions (once broadly, once itemized by
specific property) — confirmed both times. This is a personal/portfolio project,
not a Spotify Platform integration under review; chose visual ambition over
guideline conformance for this one constraint. Not legal advice; a conscious
tradeoff, logged rather than silently dropped. D9 (one source active, never
combined) and C13's attribution requirements (badge, link-out, no
SoundCloud-confusable naming) are untouched.

**T1-flagship rationale, rewritten (PLAN.md §4):** the old argument — artwork-forward
is bounded by definition, type/motion-forward has no ceiling — no longer holds once
crop/overlay/filter/animation are allowed. T1 stays flagship because its identity
(type, motion, layout) is generated from data the app always has, so its impact
doesn't depend on any given track's artwork quality — unlike T2/T4, which are
structurally capped by the source image. T1 also keeps its existing visual sign-off
and is what PLAN.md already calls "what the project is judged on"; changing
flagship status wasn't requested.

**No contract version bump.** The v1→v2 bump (2026-09-22, earlier today) was for a
genuinely new Root attribute (`data-theme`). This change adds no part/attribute/
variable — only `guard.css`'s internal permissions and the prose describing them
change. Per the contract's own stated rule ("any change to a part, attribute or
**variable name** is a version bump"), that doesn't cross the bar. A direction that
*would* have needed one ("Collage" — real track/artist text as a decorative
background layer via a new `data-title`/`data-artist` attribute) was considered and
explicitly not built this round, in favor of "Ring + Depth" (see the redesign entry
below) — a possible future direction, not abandoned.

**guard.css, before → after:**
```css
/* before */
.mp-artwork {
  filter: none !important; animation: none !important; border-radius: 4px !important;
  opacity: 1 !important; transform: none !important; clip-path: none !important;
  mask: none !important; mix-blend-mode: normal !important;
}
/* after */
.mp-artwork {
  opacity: 1 !important; transform: none !important;
  mask: none !important; mix-blend-mode: normal !important;
}
```
**Side effect caught and fixed in the same change:** none of the four themes
declared their own `border-radius` on `.mp-artwork` — all four got 4px only from
guard's forced rule. Deleting that line with no replacement would have silently
regressed T2/T3/T4 to square corners, even though scope is T1-only. Fixed with a
plain, low-specificity default in `src/theme/structure.css`
(`.mp-artwork { border-radius: 4px; }`) — same specificity as guard's old rule, so
T2/T3/T4 look identical, and T1's higher-specificity rule overrides it normally.

**New enforcement replacing lost guard coverage:** `e2e/contract.spec.ts` gains a
bounding-box overlap assertion (`.mp-artwork` vs. every interactive control:
`.mp-btn-prev/play/next`, `.mp-volume-wrap`, `.mp-link-out`), run per-theme.
`.mp-progress` is deliberately excluded — non-interactive per the "Not in v1"
section, and T1's redesign depends on it overlapping the artwork by design.
First implementation used Playwright's `locator.boundingBox()`, which hung for 30s
per call in WebKit (root cause not fully diagnosed — likely its actionability/
stability wait); switched to `page.evaluate` + `getBoundingClientRect()` directly,
matching the pattern the grid-placement test already used, which resolved it
immediately.

**Also rewritten in the same change:** the existing guard hostile-stylesheet test
now asserts the new locked/unlocked split (previously all 8 properties were
expected to stay locked; now 4 are). Closed a pre-existing gap while rewriting it:
the old test injected `mask: linear-gradient(...)` in its attack but never actually
read back the computed `mask` value to confirm it was blocked — now it does.

**Docs touched:** `CLAUDE.md` (Content section), `docs/PLAN.md` (D10 decision-log
row + new amendment paragraph, "Artwork and colour" section, T1-flagship
rationale), `docs/THEME_CONTRACT.md` (`.mp-artwork` Parts bullet, Snippets/Layer-order
guard prose, Rules section — noting explicitly this is a guard/Rules-layer change
only, not a new customizer-exposed control). `docs/THEME_CONTRACT.md`'s `strip`/`card`
layout sections and T1's annotated example are pending a further update once T1's
actual redesign (below) lands.

**Not yet done as of this entry:** no theme.css has been written yet. This entry is
the decision + mechanics; T1's actual visual direction ("Ring + Depth," combining
two of three pitched concepts) is a separate change — see the next entry once it
lands.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 67 passed (unchanged);
  `npx playwright test e2e/contract.spec.ts e2e/matrix.spec.ts` 166 passed (both
  engines) — confirms T2/T3/T4 unaffected, the rewritten guard test's new split is
  correct, and the new overlap test passes against all four themes' current markup
  with zero code changes needed (nothing currently violates the still-prohibited
  controls-over-artwork rule).

## 2026-09-22 — Phase 4 / T1 redesigned: "Ring + Depth" (card layout)

The actual visual work following the D10 relaxation above. Direction mixed from two of
three pitched concepts, same pattern as T4's mix earlier today: "Ring" (Lorde-inspired —
circular crop, progress-as-frame) + "Depth Stack" (elevation/shadow, staggered motion),
dropping "Collage" (real track/artist text as background texture — no `data-title`/
`data-artist` attribute needed this round, a possible future direction, not built).

- **Layout: `strip` → `card`.** T1 now shares `card` with T2/T4 (three themes on one
  layout — `data-theme` scoping, added earlier today for exactly this, does its job).
  `strip` is now unused by any shipped theme; kept in `structure.css`, not deleted.
- **The ring**: `.mp-progress` shares `.mp-artwork`'s grid area, painted as a
  `conic-gradient` disc slightly larger than the artwork; the artwork (smaller, centered,
  `z-index: 2` above the ring's `z-index: 1`) simply covers the ring's center, leaving the
  outer band visible — no mask needed, just paint order. `.mp-progress-fill` is unused
  (`display: none`) — the ring's own gradient *is* the fill, no separate bar element.
- **The iris-wipe entrance**: `.mp-artwork`'s `clip-path` animates `circle(0% at center)` →
  `circle(50% at center)` on track change. Not a stylistic pick — `opacity`/`transform`
  stay guard-locked on `.mp-artwork` even after today's D10 relaxation, so a fade/scale
  entrance is structurally impossible; `clip-path` is the one newly-authorable property
  that's actually worth animating, so this is what the unlocked properties pointed to,
  not a compromise.
- **Needed a small `Player.tsx` change, discovered while building, not pre-planned**: the
  artwork element is a sibling of `.mp-meta`, not a child, so it didn't share `.mp-meta`'s
  existing per-track `key` remount (the mechanism every prior "replay CSS animation per
  track" trick in this codebase depends on) — its animation would only ever have played
  once, on first mount. Added the same key expression to the artwork element. **Immediately
  hit a real bug from this**: giving both siblings the *literal same* key string caused a
  React "two children with the same key" warning (keys must be unique among siblings, not
  globally) — caught by `matrix.spec.ts`'s no-console-error assertion across all 15
  affected fixtures/browsers, not by inspection. Fixed by prefixing the artwork's key
  (`artwork::${title}::${artist}`).
- **Depth**: `--mp-shadow` actually used for the first time (T1 declared it as `none`
  since Phase 3) — a real multi-layer value on the controls panel (its own background
  tone, `--t1-panel-bg`, distinct from `--mp-bg`), plus a separate literal shadow on
  `.mp-window` for ambient card lift. Kept these as two different mechanisms deliberately:
  if a customizer later exposes `--mp-shadow`, editing "the" shadow should mean the
  panel's, not this subtle backdrop.
- **Controls panel motion, decided against and logged as a deliberate non-choice**: the
  plan considered animating the controls panel's entrance too (matching the staggered
  title/artist). Didn't build it — the panel contains the play button, which a user might
  be actively clicking when a track changes; remounting it to replay an entrance animation
  risked dropping focus/hover state mid-interaction. Depth here is conveyed by the
  permanent shadow instead, not motion. Title/artist *do* stagger (`animation-delay`) since
  they're inside `.mp-meta`, already safely remounted, nothing interactive to disrupt.
- **Reduced motion**: both the iris-wipe and the staggered title/artist entrance needed
  their own explicit `@media (prefers-reduced-motion: reduce)` override — the third time
  this exact lesson has applied this session (T4's marquee, now this) — the app-wide
  0.001ms clamp alone would leave the iris-wipe snapped at a near-pinpoint circle rather
  than showing the full artwork.
- **Real bug found and fixed, pre-existing in T2 and T4, not introduced by this change**:
  writing T1's `.mp-time-current`/`.mp-time-total` initially copied a `width: 100%` that
  was never in the original strip-layout version. Checked why — a grid item's percentage
  width resolves against its own grid area, so `100%` stretched both time elements to the
  *entire* "time" cell width, leaving `justify-self: start`/`end` no free space to actually
  shift within. Both elements rendered in the exact same position, one hidden behind the
  other. Checked T2 and T4 (both already shipped, already signed off) and found the
  identical `width: 100%` in both — same bug, silently live since each was built. Fixed all
  three (removed the property; `structure.css`'s card-default `justify-self` — or T1's own,
  since T1 overrides the grid — does the actual positioning once the element sizes to its
  own content instead of stretching). T3 never had this bug (`pill` doesn't set `width` on
  the time parts). No automated test catches sibling-bounding-box overlap in a shared grid
  area — same class of gap as the T3/T4 visual bugs found earlier today by actually running
  the app, not by any assertion.
- **Visual result: ready for review** — sent as `sheet-1-states.png`, `sheet-2-
  capabilities-artwork.png` (both now T1's redesign, card-t1), and the updated
  `sheet-6-layouts-interaction.png`. Stills can't show the iris-wipe or staggered entrance —
  flagged in the message, worth a live look in the browser pane too. `docs/THEME_CONTRACT.md`'s
  freeze checklist gained a new, separate, still-unchecked sign-off line for this redesign —
  the original 2026-09-22 T1 sign-off was for the old strip-layout design and wasn't edited.
- **Docs**: `docs/PLAN.md`'s T1 roster one-liner rewritten to describe "Ring + Depth" instead
  of "artwork optional or reduced to a small accent". `docs/THEME_CONTRACT.md`'s `strip`
  section reframed as "complete, currently unused by any shipped theme" (structural CSS kept,
  not deleted); `card` section gained T1's own grid override diagram and annotated excerpt
  alongside T2's, and its "T4 also uses card" note now names T1 too.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 67 passed (unchanged);
  `npx playwright test` 322 passed (unchanged count — T1's matrix/review entries already
  existed in both THEMES arrays, this just changes which layout/theme they exercise;
  `contract.spec.ts` needed `test.slow()` on the D10 overlap test once T1's fixtures were
  added to its loop, since total time tipped past the default 30s budget in WebKit — not a
  real hang, confirmed by profiling the actual per-iteration cost); `npm run build` OK incl.
  `check-fixtures-excluded: OK`.

## 2026-09-22 — T1 gains "Collage": real track/artist text as backdrop (contract v3)

You pushed back on the "Ring + Depth" redesign — fair: the "depth" half turned out to be
one `box-shadow`, not the layered composition the Portishead reference actually showed.
Offered three ways forward (build Collage now, push depth further, leave it); you picked
building Collage — the piece explicitly scoped out earlier today for needing a new
contract attribute.

- **Contract → v3.** Added `data-title`/`data-artist` to Root (`src/player/Player.tsx`),
  same `hasTrack && track ? ... : undefined` idiom as every other conditional attribute.
  Bumped `CONTRACT_VERSION` (`src/theme/variant.ts`) 2→3 and all four `theme.json`
  `contract` fields in lockstep — same reasoning as the v1→v2 migration: `variant.ts`
  requires `manifest.contract === CONTRACT_VERSION` for every theme, so leaving three at
  `2` while the constant moved to `3` would have silently broken their variant validation.
  `variant.test.ts` needed no changes this time — the v1→v2 migration already switched its
  fixtures off hardcoded literals onto `CONTRACT_VERSION` itself, and that paid off exactly
  as intended.
- **Why `.mp-root`, not `.mp-window`:** CSS `content: attr(x)` only ever reads the
  attribute of the pseudo-element's own host element, never an ancestor's. `.mp-root` is
  documented as carrying every attribute; putting `data-title` there instead of
  `.mp-window` was the one choice that didn't create a new exception to that.
- **Real design problem hit immediately, not anticipated in the plan:** the first version
  (unbounded `white-space: nowrap`, 60px font) ran the fixture text (deliberately long,
  "FIXTURE-ONLY-DEV-BUILD Track Title") clean off the screen — looked like a broken
  overflow bug, not a backdrop. Fixed with a bounded `width` + `overflow: hidden`, which
  clips mid-word — on reflection this is the *authentic* reference aesthetic anyway (the
  Portishead card's collage text is visibly cropped by the composition, not whole floating
  words), not a workaround dressed up as a feature.
- **A real architectural tension, worked through rather than glossed over:** for the
  clipped-but-visible peek to read as anything, a meaningful chunk of the pseudo-element's
  box needs to sit *outside* `.mp-window`'s own opaque background, extending past its
  edges. But `docs/THEME_CONTRACT.md`'s own `window` field guidance says the native window
  should tightly fit `.mp-window` ("not needlessly larger") — the two goals directly
  conflict. Resolved by treating T1's window as a **named, documented exception**: bumped
  `theme.json` from `280×573` (tightly fit) to `340×600` (real reserved margin), and
  `e2e/contract.spec.ts`'s window-fit test now skips the "filled by the largest state"
  check specifically for `t1-default` (the ceiling/overflow check still applies to every
  theme, unconditionally — content overflowing the declared window is still a real bug
  regardless of the reason the window itself is sized generously). Documented in the field
  table itself, not just buried in a comment, so a future reader of the contract doc alone
  understands why T1 doesn't match its own stated rule.
- **Worth being honest about a real limitation:** this window-size reservation is
  currently *aspirational* — there is no code yet (Rust theme loader, Phase 4/5) that
  actually centers/anchors `.mp-window` within a native canvas sized to `theme.json`'s
  declared `window`. Today, in the dev harness, the peek is visible only because the
  surrounding page happens to have room; the declared `340×600` is documentation of future
  intent, verified correct-in-principle, not something currently mechanically enforced
  beyond "doesn't overflow." Flagging this rather than implying it's already wired up.
- **Tuned by direct visual inspection, not guesswork alone** — the first legible pass
  (16% opacity, ~90px peek) was real but too subtle to register as intentional in a normal
  screenshot; confirmed via `getComputedStyle`/`getBoundingClientRect` that it was working
  correctly before concluding it just needed more presence, not a different mechanism.
  Settled at 22% opacity, ~96px peek, verified legible in a tightly-cropped viewport
  screenshot (clear rotated "...LY-D..." fragment, reads as texture, not noise).
  **Deliberately still subtle, not a loud banner** — this is a compact mini player, not a
  poster; a dramatic full-width bleed would have needed a *much* wider native window,
  working against the product's own scale. Logged as a considered trade, not a compromise
  reached by running out of time.
- `data-hide-title`/`data-hide-artist` also hide the Collage layer's corresponding
  pseudo-element — customizer plumbing that doesn't exist yet (Phase 4), but keeps the
  contract coherent for when it does.
- **One real, transient test failure while verifying, diagnosed rather than papered
  over:** a single WebKit screenshot test ("card-t1 — no capabilities") hit Playwright's
  "waiting for element to be stable" 30s timeout on the first full-suite run. Re-ran it in
  isolation — passed cleanly in 690ms. Re-ran the *entire* suite a second time to confirm
  it wasn't systemic — clean. Concluded WebKit resource contention under the full suite's
  parallel load, not a real animation-stability bug in T1's CSS; logged as diagnosed, not
  silently retried into a false green.
- **Visual result: ready for review** — sent as the updated `sheet-1-states.png` and
  `sheet-2-capabilities-artwork.png`.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 67 passed (unchanged);
  `npx playwright test` 322 passed (unchanged count — Collage is a pseudo-element, not a
  new selector/test case; Chromium + WebKit, full suite run twice to confirm the one
  transient failure above wasn't real); `npm run build` OK incl.
  `check-fixtures-excluded: OK`.

## 2026-09-23 — Animated assets, step 1: icon click/idle animation (all themes)

First step of the approved animated-assets plan (text/shape effects follow, as customizer
opt-ins under contract v4; icons are the only default-on piece).

- `src/theme/structure.css`: transport icons animate the inline `<svg>` (not the button, so a
  theme's own button transforms can't clash). Click = pure CSS `:active` press (prev/next also
  nudge 2px in their direction) with no remount, so focus/hover survive (same reasoning as
  T1's decision not to animate the controls panel). Play<->pause swap replays a short
  `mp-icon-in` because the svg remounts. Idle = looped pulse on the play icon only while
  `data-status="paused"`; nothing loops while playing.
- Reduced motion gets its own explicit override (animation/transition `none`) rather than
  relying on the global 0.001ms clamp, which would leave a looping pulse frozen mid-scale.
- New optional custom properties `--mp-icon-press-scale` and `--mp-icon-idle-anim` are used
  with fallbacks. **Not yet in THEME_CONTRACT.md** — to be documented in the v4 bump alongside
  the fx attributes, not versioned separately.
- Chose plain SVG+CSS over Lottie/Rive/Lordicon: research (see plan) put Lottie at 60-100 kB
  gzipped and Rive's runtime near 200 kB, far too heavy for three icons.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 67 passed; `npx playwright test`
  322 passed (Chromium + WebKit); computed styles in the harness (paused fixture) show
  `mp-icon-in, mp-icon-idle` running on `.mp-btn-play svg`. Visual result: **ready for
  review** — not screenshotted; motion isn't visible in a still.

## 2026-09-23 — Animated assets, step 2: simulated beat, waveform, shapes (opt-in)

Second step of the approved plan. Adds the app-provided `src/fx/` layer; **contract v4 is NOT
bumped yet and `THEME_CONTRACT.md` is not updated** — that is deliberately batched into step 5
(with the icon custom properties from step 1, and the text effects), so until then `data-fx-shapes`,
`data-fx-waveform`, `.mp-shapes`, `.mp-waveform` and `--mp-beat` exist in code but are undocumented.
Everything is off by default (`Player`'s new optional `fx` prop); no customizer UI exists, so only
the dev harness (checkboxes, or `?fx=shapes,waveform` in the matrix URL) turns them on.

- **The beat is simulated, not audio analysis.** `src/fx/beat.ts` seeds a smooth raised-cosine
  pulse (80–128 BPM, slowly wandering phase, half-time overtone) from a hash of title+artist.
  Nothing listens to the music (PLAN.md §9: no clean audio source). It must never be described as
  reacting to audio. Subtlety is enforced, not just intended: `beat.test.ts` asserts the value
  never jumps >0.3 in one ~30fps frame, and CSS uses it at 5–10% amplitude.
- **Waveform is a static seeded bar profile** of the track (`waveformPeaks`), filled to
  `--mp-progress`; only a ~10% vertical shimmer follows the beat. Built as two stacked SVGs
  sharing one path (muted base + accent clip) rather than adopting wavesurfer.js (see plan: it is
  built around a real audio element).
- **Window size cannot change** (theme.json windows are fixed and the native window can't resize
  itself). So the waveform does not add a row: it spans the existing progress+time rows (card,
  strip) and hides the bar and time labels with `visibility:hidden` so their space is kept. T1's
  progress is the ring, so its waveform takes the `time` row as a 14px strip and the ring stays.
  The compact pill (T3) has no room and hides the waveform. **Trade-off: time labels are hidden
  while the waveform is on.**
- **Shapes** sit at `z-index:-1` inside `.mp-window` (which gets `isolation:isolate` only when
  shapes are on — the T4 stacking lesson), clipped to the window box, `pointer-events:none`
  (also locked in `guard.css`), ~16% opacity so they don't disturb text contrast.
- **useBeat** writes `--mp-beat` onto the two effect elements only (not `.mp-root`), ~30fps,
  0 when paused or under reduced motion. Explicit reduced-motion overrides for shapes/waveform.
- **Environment note:** the built-in browser pane only fires `requestAnimationFrame` when it paints
  a frame, so I could not watch continuous motion there; the moving beat is verified by
  `e2e/fx.spec.ts` in Chromium and WebKit instead (samples >3 distinct values in 5s).
- Real bug found while verifying: my first `fx.spec.ts` failed on T3 because a `display:none`
  waveform has a 0×0 box at the origin and looked "outside the window" — a test bug, fixed by
  skipping the containment check for hidden elements.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 75 passed (8 new in `beat.test.ts`);
  `npx playwright test` 346 passed (24 new in `e2e/fx.spec.ts`: window size unchanged with fx on,
  layers inside the window, shapes non-interactive, waveform overlaps no control, beat moves/holds
  at 0 when paused/reduced motion, no console errors — all four themes, both engines);
  `npm run build` OK incl. `check-fixtures-excluded: OK`. Visual result: **ready for review** (I
  looked at T2 and T1 with both on; stills can't show motion).

## 2026-09-23 — Animated assets, step 3: text effects (typewriter, ripple, liquid)

Third step of the approved plan. Adds `animejs` 4.5.0 (MIT) as the one new dependency and
`src/fx/AnimatedText.tsx`. Opt-in via `FxSettings.title/artist` (dev harness selects, or
`?fx=title:ripple,artist:liquid`). **Contract v4 still not bumped / THEME_CONTRACT.md still not
updated** (batched into step 5); `data-fx-title`/`data-fx-artist` exist in code, undocumented.

- **typewriter:** anime `splitText({chars, accessible})` + `stagger(38ms)` opacity reveal.
- **ripple:** `feTurbulence`+`feDisplacementMap` SVG filter (Henry-from-Online technique), with the
  displacement scale and noise frequency animated by anime; continuous, gentle.
- **liquid:** gooey blur + alpha-contrast matrix; the title *resolves* out of a blur on each track
  change, then the filter is removed so resting text is crisp. **This is not the old-title →
  new-title morph the plan floated** — the element remounts per track, so the old text is gone; it
  is a coalesce-in. Said plainly rather than calling it a morph.
- Filters live in one hidden 0x0 `<svg>` (`FxFilters`) rendered in `.mp-root` *outside*
  `.mp-window` so it is never a grid item (no `grid-area` needed). It must not be `display:none`
  (that disables the filter). Title and artist share one filter each, so both animate together
  when both use the same effect — acceptable, not per-element.
- Reduced motion renders plain static text (no split, no filter), tested.
- **Real finding:** anime's `accessible` mode adds ONE visually-hidden copy of the string for
  screen readers and marks the letter spans `aria-hidden`, so `textContent` reads the text twice
  while typewriter is active. My first test asserted equality and failed on exactly this; the test
  now checks the visible letters spell the original and the a11y copy is exact. Screen readers hear
  the text once.
- **Known visual limitation (seen, not fixed):** typewriter splits into inline-block letters, which
  defeats `text-overflow: ellipsis`, so a title too long for its box hard-clips mid-letter
  ("…DEV-E") instead of ending in "…" while typewriter is on. Ripple/liquid keep the ellipsis.
  Worth a follow-up (e.g. a fade mask on the edge) rather than guessing now.
- **Cost:** production JS 230.7 kB → 273.4 kB (gzip 72.97 → 89.71 kB, +16.7 kB), measured from
  `npm run build`, not estimated.
- Test bugs found and fixed while verifying (not product bugs): asserted before the async
  fixture load finished; T3's collapsed title reports Playwright-"hidden" so those checks use
  `toBeAttached`; a regex lost its backslash when written via a script.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 75 passed; `npx playwright test`
  378 passed (Chromium + WebKit; new: per theme × 3 effects for text-unchanged/settles/no console
  errors, plus reduced-motion) — WebKit ran the SVG filters without errors, but pass/fail there
  says nothing about how the filters *look*; `npm run build` OK incl.
  `check-fixtures-excluded: OK`. In the browser pane I saw T1 typewriter mid-reveal ("F") and
  finished, with the artist ripple filter applied. Visual result: **ready for review** — the
  ripple/liquid look in particular needs your eyes, and a real WebKit/Mac check.

## 2026-09-23 — Animated assets, step 4: `effects` in the variant model + harness variant box

Fourth step of the plan. Effects can now be saved/imported as part of a customizer variant and
validated like everything else in it. **Contract still not bumped to v4 and THEME_CONTRACT.md's
"Variants" section still not updated** (batched into step 5), so `CONTRACT_VERSION` stays 3 and the
`effects` key is undocumented until then.

- `src/theme/variant.ts`: `Variant.effects?: Effects` (`Effects` = the Player's `FxSettings`, so an
  applied variant passes straight in as the `fx` prop). `shapes`/`waveform` are booleans;
  `title`/`artist` are an enum (`TEXT_FX`: typewriter, ripple, liquid). **No free text or CSS
  anywhere in it**, so the existing injection rules (`url(`, `;`, `{}` …) don't even apply — an
  out-of-enum string is just `effect-invalid`.
- **Backward compatible on purpose:** `effects` is omitted from a validated variant when nothing is
  on (`false`/`null`/`{}` all normalise to absent), so variants saved before effects existed
  validate to exactly what they were (asserted). New issue code `effect-invalid`; `unknown-key`
  and `not-an-object` reused for stray effect keys / wrong container. Invalid entries are dropped
  individually (partial import), same policy as overrides.
- `variantToDom` now also returns `effects` (always an object, possibly empty). One existing test
  updated for the new field; nothing else changed in existing expectations.
- `src/dev/DevHarness.tsx`: a dev-only "variant JSON" box validates pasted JSON against the
  selected theme's real `theme.json` and applies `effects`, showing issues as raw codes (no prose —
  displayed strings come from COPY.md, CLAUDE.md). **This is a dev tool, not the customizer**: no
  customizer UI, persistence, or per-theme variant storage exists yet (Phase 4).
- Not done here: overrides/hidden from a pasted variant are validated but not applied by the
  harness (only effects are); a failed validation of the whole file (wrong theme/contract) applies
  nothing and keeps the previous state, tested.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 82 passed (7 new in
  `variant.test.ts`: old-file compatibility, every value round-trips, false/empty → absent,
  partial import, injection attempts incl. `TYPEWRITER`/`"typewriter "`/`__proto__`/non-strings,
  wrong container, prototype pollution); `npx playwright test` 380 passed (new e2e: paste a variant
  → `data-fx-*` attributes appear; invalid value dropped with `effect-invalid@effects.title` while
  valid ones apply; wrong-theme variant applies nothing); `npm run build` OK incl.
  `check-fixtures-excluded: OK` (273.69 kB JS / 89.87 kB gzip).

## 2026-09-23 — Animated assets, step 5: contract v4 + docs (plan complete)

Final step. Everything from steps 1–4 is now documented and versioned in one change, as CLAUDE.md
requires ("bump the contract version and update the doc in the same change").

- `CONTRACT_VERSION` 3→4 (`src/theme/variant.ts`) and all four `theme.json` `contract` fields, in
  lockstep (the v2→v3 lesson). Purely additive — nothing renamed or removed.
- `docs/THEME_CONTRACT.md`: version/status/changelog; Root (`data-fx-shapes|waveform|title|artist`);
  App-provided variables (`--mp-beat`, flagged **simulated**); Parts (`.mp-shapes`, `.mp-shape`,
  `.mp-waveform`, `.mp-wave-base`, `.mp-wave-fill`, `.mp-fx-filters`); a new **Effects** section
  (also finally documents step 1's `--mp-icon-press-scale` / `--mp-icon-idle-anim`, and states the
  typewriter-ellipsis limitation and the shared-filter behaviour); Variants (`effects` shape,
  `effect-invalid`, and the stale example's `"contract": 1` → 4).
- `docs/PLAN.md`: new **D16** row; §9 audio-visualiser bullet now says decorative shapes/waveform
  exist on a *simulated* beat and real audio reaction is still parked.
- `docs/COPY.md`: customizer effect labels/options/note as `[NEEDS COPY]` (no UI reads them yet).
- `.mp-fx-filters` class added to the filter `<svg>` (it had none; the contract test would not have
  matched it otherwise).
- **The doc-vs-DOM tests now cover effects:** `e2e/contract.spec.ts` renders one fixture with every
  effect on and unions its classes/attributes into the Parts/Root comparison (the five internal
  `mp-shape-*` variant classes are explicitly exempt and named as such in the doc), and a new test
  fails if the doc's "Contract version: N", `CONTRACT_VERSION`, or any theme.json ever disagree.
- **The new tests caught two of my own slips before they shipped:** the first draft listed
  `.mp-wave-base` and `.mp-wave-fill` in ONE bullet, which the doc parser (first backtick token per
  bullet) read as one part — the Parts test failed until they were split; and my regex edit to the
  spec lost a backslash through a script (syntax error, and `tsc` doesn't cover `e2e/`, so only
  running Playwright showed it).
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 82 passed; `npx playwright test`
  382 passed (Chromium + WebKit); `npm run build` OK incl. `check-fixtures-excluded: OK`
  (274.26 kB JS / 90.02 kB gzip).

### Plan status
Done: icon animation (default), simulated beat, waveform, shapes, typewriter/ripple/liquid text,
variant `effects` + validation, contract v4 + docs. **Still open / not built:** a real customizer
UI and persistence (Phase 4); the typewriter-ellipsis fix; watching the ripple/liquid look and
WebKit rendering by eye (and on a real Mac); T1/T2/T3/T4 have not been visually re-reviewed with
effects on beyond T1/T2 spot checks; real audio reaction (parked, D16).

## 2026-09-23 — Design round 2, S9 spike + step 1: T5 "Kinetic" skeleton

Plan: `~/.claude/plans/i-want-to-add-elegant-taco.md` (research → picks: split-flap title, text around
the ring, physics letters, artwork treatments, squircle card, track-change morph, tape reels;
delivered as new theme T5, vibe "chaotic kinetic"). This entry covers the spike and step 1 only;
steps 2–7 (treatments, split-flap, text wrap, view-transition morph, physics debris, contract v5)
are NOT built.

**S9 spike outcome (checks, not shipped code):**
- The embedded browser (Chrome 152) supports `corner-shape` (`superellipse(2)` and `squircle`),
  `document.startViewTransition`, `shape-outside`, `Intl.Segmenter` and `CSS.registerProperty`.
  **Caveat:** that is this dev pane, not the user's installed WebView2 — Tauri uses the evergreen
  Edge runtime, so it is *probably* as new, but is unverified until the real Tauri build is run.
- Flap library: `@splitflap/core` 0.1.1 is MIT, 14 kB unpacked, zero deps, vanilla, no sound, with a
  clean `new SplitFlap(el,{text}).setText()` API — a better fit than `solari-split-flap` (whole-board,
  synthesized click sound, 87 kB). Very new (0.1.x, March 2026), so adopt behind one wrapper.
  **Flag for your call:** a flap display flips through intermediate glyphs before landing on the
  real text (and `textInit` defaults to random letters). The final text is always the real title;
  I will seed `textInit` with the previous title, but the transient in-between glyphs are inherent to
  the effect. Say if you read CLAUDE.md's "never generate displayed text" as ruling that out.
- Still to be *measured*, not assumed: `shape-outside` vs Pretext reflow jank (step 4), Matter.js
  cleanup/leak check (step 6). `matter-js` 0.20.0 and `@chenglou/pretext` 0.0.9 are both MIT.

**Step 1 — `themes/t5-kinetic/` (card layout), done:**
- Teal-ink `#12343b` / cream `#f4ecd8` / muted `#9fb8b4` / signal orange `#ff5a1f` / tape brown —
  deliberately not T1–T4's palettes and not PLAN.md's generic defaults (no cream+terracotta serif,
  no black+acid-green). Orange is decorative or behind dark text; text pairs are fg/bg and muted/bg.
- **Squircle body** via `corner-shape: superellipse(2)`, breathing to `superellipse(3.5)` + smaller
  radius on `data-hover`; artwork uses `corner-shape: squircle`. Plain rounded corners where
  unsupported (WKWebView — untested).
- **Tape reels** = the two pseudo-elements of `.mp-window` (no new parts, no contract change): the
  disc *is* the tape pack (`border-radius` clips the background layers), spoked hub via
  `repeating-conic-gradient`; left pack shrinks and right grows with real `--mp-progress`; they spin
  only while `data-status="playing"` (right reel slightly faster). `.mp-window` gets
  `isolation:isolate` so the `z-index:-1` reels stay above the card's own background (T4 lesson).
- Keycap transport (chunky keys, orange play), tape-counter rule, reduced motion = static reels and
  no corner morph (explicit override, not just the global clamp).
- `theme.json`: `window` 320×490 (measured: guess high at 640, the contract test reported the real
  tallest state 484, locked in with headroom). `colorMode` is declared `artwork` for the coming
  palette-driven treatment; T5 does not use `--mp-art-*` yet.
- T5 added to every theme list: harness, `contract/matrix/review/fx` specs, `review-sheet.mjs`.
- **Unrelated flaky test found and fixed while running the full suite:** T3's window-fit test
  failed in WebKit (CJK fixture measured 85.25px vs the 84+1 ceiling) — the same run-to-run
  font-metric jitter class already logged on 2026-09-22, not caused by T5. Raised T3's `window`
  height 84→86 after `--repeat-each` runs showed 87 breaks *Chromium's* lower fill bound (24/24 pass
  at 86 over 12 repeats per engine). This edits a signed-off theme's declared native window size by
  2px; flagging rather than hiding it.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 82 passed; `npx playwright test`
  full suite green after the T3 fix (T5: 34 matrix/AA cells × 2 engines, window-fit, grid
  placement, fx layers and text effects on T5 all pass); `npm run build` OK incl.
  `check-fixtures-excluded: OK`. Looked at T5 in the browser pane: renders, squircle corners and
  reels visible. Visual result: **ready for review** — reel spin and the hover corner morph are
  motion; not watched.

## 2026-09-23 — Design round 2, step 2: live artwork treatments (T5 uses duotone)

Step 2 of the T5 plan. **Contract v5 / THEME_CONTRACT.md not touched yet** (batched into step 7):
the three filter ids below are code-only and undocumented until then.

- `src/fx/artFilter.ts` (pure, 10 unit tests): `pickDuotone` chooses shadows = the darkest palette
  colour pushed 55% toward black, highlights = the most saturated colour (lifted 40% toward white)
  when the artwork has a real accent (saturation ≥ 0.25), else the lightest; falls back to the
  lightest, then plain black/white, so the pair always separates by ≥ 4:1 (tested on mid-tone,
  RGB-primary and near-grey palettes). No palette (no artwork / loading / tainted canvas) → plain
  greyscale. Also our own Bayer-matrix generator (`bayerMatrix`, checked against the textbook 4×4).
- **Why JS:** SVG filter `tableValues` are attributes and can't read `--mp-art-*`, so the app
  computes them from the extracted palette and renders the defs.
- `FxFilters` (the existing hidden `.mp-fx-filters` svg) now always renders (was only when a
  ripple/liquid text effect was on) and also holds `#mp-art-duotone`, `#mp-art-posterize`,
  `#mp-art-dither`. Reusing the documented class meant no new part, so the doc-vs-DOM test still
  matches. Cost of "always rendered": a tiny 0×0 svg + an 8×8 canvas-generated tile per render.
- **Dither** is our own chain (grey → compare against a repeating 8×8 Bayer tile via feImage/feTile/
  feComposite → threshold → recolour to the duotone), *not* a copy of `dither-with-css` (no license
  stated). The arithmetic is tuned so alpha stays 1 (k2+k3+k4 = 1); a naïve "gray − tile + 0.5"
  would have halved alpha and clamped the colour (premultiplied-alpha trap).
- T5's `.mp-artwork` uses `filter: url(#mp-art-duotone)`. Posterize and dither are one-line
  swaps. **T5 ships with duotone, not dither, on purpose:** dither looked best in Chromium but relies
  on `feImage` inside an HTML-element filter, which I could not verify in WebKit/WKWebView; duotone
  is the safe cross-engine default.
- New synthetic fixture `colorful artwork (filter test)` (FIXTURE-marked, dev-only; palette navy /
  red / cream) so the treatments have something to show. It adds one cell per theme to every matrix.
- **Looked at, in the browser pane (Chrome 152), all three on the fixture:** duotone = mauve/navy,
  posterize = vivid 4-level bands, dither = pink-on-navy halftone dots. Rendering in WebKit is
  untested beyond "no console errors".
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 92 passed (10 new);
  `npx playwright test` 492 passed (Chromium + WebKit; new: filters exist in every theme, duotone
  table follows the palette, dither tile is a generated PNG, T5 applies the filter and T2 leaves
  artwork unfiltered); `npm run build` OK incl. `check-fixtures-excluded: OK` (277.88 kB JS /
  91.14 kB gzip, +1.12 kB gzip for this step). Visual result: **ready for review**.

## 2026-09-23 — Design round 2, step 3: split-flap title (T5)

Step 3 of the T5 plan. **Contract v5 / THEME_CONTRACT.md not touched yet** (step 7): `splitflap` in
`data-fx-title`/`data-fx-artist`, the `--mp-flap-bg/fg/edge` tokens and theme.json `fx` exist in code
but are undocumented until then. You did not answer last turn's question about in-between glyphs, so I
took the conservative reading (below) rather than assume it was fine.

- **@splitflap/core 0.1.1 (MIT, ~9 kB source, zero deps, no sound) — read its source before adopting.**
  Three behaviours would have broken CLAUDE.md's "never generate displayed text" or garbled real
  titles, each handled in our code instead of trusted:
  1. It flips through its *whole default alphabet* (`A–Z 0–9 .,!?#@()+-=`) on the way to a letter, and
     random letters when no `textInit` is given. **Fix:** `charsMap` is built from ONLY the distinct
     letters of the previous and new title (+ space) (`flapAlphabet`), `textInit` is always the
     previous real title (kept in a module-level `lastShown`, because the player remounts the title
     each track), and `maxFlips: 6` keeps runs short. Verified by a test that samples every glyph on
     the board every 40 ms while it flips and asserts none is outside that alphabet.
  2. It silently replaces any character not in its map with a space — CJK/accented titles would have
     gone blank. **Fix:** the alphabet is the title's own characters, so nothing is substituted; the
     CJK fixture is tested.
  3. It `toUpperCase()`s and reads one UTF-16 unit at a time. **Fix:** we upper-case first and
     paginate/pad the upper-cased text; text it would garble (emoji, astral CJK; `isFlapSafe`) falls
     back to the plain title (new fixture `emoji title (split-flap falls back to plain text)`).
     The board therefore shows CAPITALS (like a real Solari board, and like T2's CSS-uppercased
     artist); the accessible copy keeps the original case.
- **Fixed cells, so long titles page:** 10 columns × 20 px for the title (14 × 14 px for an artist),
  cell width chosen so CJK glyphs fit. `paginate` packs whole words greedily and hard-splits a word
  longer than a page; a property test proves no character is ever lost or added. Multi-page titles
  advance every 3.2 s. Note the synthetic fixture's 22-character hyphenated "word" hard-splits
  mid-word ("FIXTURE-ON…") — real titles mostly wrap cleanly on spaces.
- Accessibility: the board is `aria-hidden`; the only readable child of `.mp-title` is a
  visually-hidden exact copy of the real string (tested). Reduced motion shows plain static text, no
  board (tested). Tile text is cream on `--mp-flap-bg` ink and is AA-checked in a test (the library
  paints tile colours inline, so the matrix's `.mp-title` colour check can't see them).
- **New theme tokens** `--mp-flap-bg`, `--mp-flap-fg`, `--mp-flap-edge` (fall back to `--mp-bg`/
  `--mp-fg`) passed through as `var()` strings to the library's inline styles.
- **theme.json `fx` defaults:** new optional `fx` field (T5: `{"title":"splitflap"}`), validated by a
  new shared `validateEffects` (the variant validator was refactored to use it; every shipped
  theme's `fx` is unit-tested). There is no real theme loader yet, so only the dev harness applies
  it — switching theme resets to that theme's defaults (tested), and URL-driven matrix cells stay
  deterministic (they ignore theme defaults).
- `TextFx`/`TEXT_FX` gain `splitflap` (variants may select it for title or artist).
- **Cost:** production JS 277.88 → 285.09 kB (gzip 91.14 → 93.54 kB, +2.4 kB).
- **Test slips (mine, not product bugs):** my first board-reading selector read the wrong DOM level,
  and two polling tests threw before the board's DOM existed (Playwright's `expect.poll` does not
  retry a throwing callback); fixed, then 80/80 over `--repeat-each=5`.
- **Not verified by eye beyond one screenshot:** I saw the settled board in the browser pane
  ("FIXTURE-ON" tiles). I did not watch a flip animation or a page turn, and WebKit's look is
  untested (only "runs, no console errors"). `@splitflap/core` is 0.1.x, released March 2026 — the
  wrapper is the single place to swap it.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 108 passed (16 new: paginate/pad/
  alphabet/safety, effects validation, theme fx); `npx playwright test` green on the final full run
  (Chromium + WebKit; new `e2e/flap.spec.ts`: 16 tests incl. glyph-alphabet sampling, page turn, AA,
  window fit, emoji fallback, reduced motion, theme-default switching); `npm run build` OK incl.
  `check-fixtures-excluded: OK`. Visual result: **ready for review**.

## 2026-09-23 — Design round 2, step 4: text flowing around the reels (native CSS, not Pretext)

Step 4 of the T5 plan. **Contract v5 / THEME_CONTRACT.md not touched yet** (step 7): the new `.mp-flow`
part, `data-fx-flow` attribute and variant `effects.flow` exist in code but are undocumented. They are
deliberately NOT in the contract test's `FX_ALL` yet, for the same reason — step 7 adds them together.

**Decision (the spike the plan asked for): native `shape-outside`, no Pretext.** Measured, not assumed:
- Cost of a reflow (change `--mp-progress`, force layout) in the embedded Chrome 152: **0.91 ms avg with
  the flow layer vs 0.59 ms without** (p95 1.2 ms, max 2.1 ms) — i.e. the flow adds ~0.3 ms, against a
  16 ms frame, and progress changes at most a few times per second. Playwright's own runs: ~0.6 ms
  (Chromium), ~1.1–1.4 ms (WebKit). A committed test asserts < 8 ms to catch pathologies.
- Since the reflow trigger is slow (progress ticks, not per-frame), Pretext's advantage — layout without
  the DOM at thousands of calls per frame — has nothing to do here. It would also add ~15 kB gzip, and it
  cannot do variable-font axes. **Not adopted.** If a future theme animates an obstacle every frame (a
  bouncing shape), revisit.

**What was built:**
- `src/fx/Flow.tsx`: a decorative `.mp-flow` layer (`aria-hidden`, `pointer-events:none` also guard-locked,
  clipped to the window, `z-index:-2`) whose text is the real title/artist/album repeated with `·`
  separators — no invented words (test removes every real string and asserts only separators remain). Two
  empty `<i>` elements are the exclusion shapes; the *theme* floats them and gives them `shape-outside`.
- An **unthemed flow is invisible** (`color: transparent` in `fx.css`) so enabling it on a theme that
  doesn't style it can never dump raw text behind that theme's content (tested on T2).
- T5 styles it: faint (9% cream) uppercase bold type; the two floats carry `shape-outside: circle()` sized
  from the same progress-driven variables as the reels (`--t5-reel-l/r`, and a new shared `--t5-reel-cx/cy`
  that both the reel positions and the flow now derive from, so they cannot drift apart). The wrap
  therefore reflows live as the tape unspools. T5's `theme.json` `fx` now defaults `flow: true` too.
- `FxSettings.flow`, `data-fx-flow`, variant `effects.flow` (validated as a boolean like shapes/waveform),
  harness checkbox + `?fx=flow`.

**Verification that the tests are not vacuous (mutation-checked):** my first geometry test — "no line
fragment touches a reel" — passed *with the circle removed*, because the floated **box** is itself an
exclusion and already covers the circle. Added a test that text tucks into the box corners (which only the
circle allows) at the largest reel size, and confirmed in the browser that with `shape-outside:none` the
lines stop at the box edge (min x 104 vs 82 with the circle). That test carries its own mutation check.
- **Real WebKit finding:** WebKit does not re-run float line layout when only `shape-outside` changes on an
  already laid-out float (line positions were identical before/after), which made that mutation check pass
  wrongly there. The test now forces a fresh layout of the layer first; 48/48 over `--repeat-each=3`.
  (Width/size changes — what progress drives — do re-layout in WebKit; the live-reflow test passes there.)
- Contrast: 9% is not arbitrary. At 14% the worst-case blended backdrop put `--mp-muted` at ~4.2:1
  (< AA); 9% gives ~4.85:1. A test blends the real backdrop with the flow's own alpha and checks every T5
  text part is ≥ 4.5:1.

**Looked at (browser pane):** the flow renders behind the card and visibly parts around both reels, and the
left reel's neighbours tuck in as it grows at progress 0. The synthetic fixture's 22-character hyphenated
"word" makes the backdrop ragged; real titles will wrap more evenly. WebKit's *look* is unchecked beyond the
geometry tests.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 108 passed; `npx playwright test` green on the
  final full run (new `e2e/flow.spec.ts`, 16 cases × 2 engines: layer contract, wraps-and-tucks, live
  reflow, cost, AA, unthemed-invisible, harness/variant); `npm run build` OK incl.
  `check-fixtures-excluded: OK` (285.53 kB JS / 93.70 kB gzip, +0.16 kB gzip for this step).
- Addendum: under the full suite's parallel load one WebKit run of the cost test measured 3.2 ms avg (still
  well under the 8 ms ceiling); the quiet-machine numbers above are the representative ones.

## 2026-09-23 — Design round 2, step 5: track-change morph (View Transitions, T5 "cassette swap")

Step 5 of the T5 plan. **Contract v5 / THEME_CONTRACT.md not touched yet** (step 7): `data-fx-morph`,
variant `effects.morph`, and the theme-owned `view-transition-name` convention are undocumented until then.

- `src/fx/useTrackTransition.ts`: when the track identity (`title::artist`) changes, the Player keeps
  rendering the OLD `{nowPlaying, positionMs}` until the browser has captured it, then swaps inside
  `document.startViewTransition(() => { apply; flushSync(rerender) })` (the new DOM must exist before the
  callback returns). Everything that is *not* a track change — position ticks, play/pause, capabilities —
  passes straight through with zero added latency (tested: no transition and status updates at once).
  Off / unsupported / `prefers-reduced-motion` → the new value is applied immediately (tested). Rapid
  successive changes settle on the last one and never flip back (tested); a pending guard avoids double-starts.
- Opt-in `morph` in `FxSettings` / variants (`effects.morph`, boolean, validated like the others) /
  harness checkbox / `?fx=morph`; T5's theme.json `fx` now `{ title: splitflap, flow, morph }`.
- **T5 style ("cassette swap"):** T5 names its card (`view-transition-name: mp-card`, only when
  `data-fx-morph` is on). The old deck tilts and slides out left, the new one slides in from the right with a
  small overshoot. The document-level pseudo-elements are scoped to this theme with `html:has(.mp-root[...])`,
  and the `root` group's default cross-fade is disabled so only the card animates.
- **The artwork-fade grey area I flagged: avoided rather than accepted.** Both keyframes are pure
  transform (translate + rotate) — **no opacity anywhere**, so the artwork is never faded by the browser's
  default cross-dissolve either. A test asserts neither `t5-deck-*` keyframe contains `opacity` and that
  `.mp-artwork`'s computed opacity stays 1 (guard intact). Caveat that remains: a theme that opts into
  `morph` but names nothing gets the browser's *default* root cross-fade of the whole page, which does fade
  everything (artwork included) — only T5 opts in today, and a future theme should style its own transition.
- **Verified by actually watching it (not just counting calls):** the embedded browser pane is hidden, and a
  hidden document skips view transitions, so it can't show this. I drove Playwright's Chromium instead, slowed
  the animation, and looked at stills: at ~0.5 s the old card (old artwork, old flow text) is still in place
  while the new card's edge enters from the right; at ~1.5 s the old card is tilting out left and the new
  card, with the new title's flow text, is in place. Both Playwright engines expose `startViewTransition` and run
  `t5-deck-out` / `t5-deck-in` (asserted, non-vacuously, via the spied call and `getAnimations()`); WebKit's
  *appearance* is not looked at, and this is Playwright's WebKit build, not WKWebView on a Mac.
- **Also seen, unrelated to this step:** the flap board's `textContent` doubles the letters (upper + lower
  halves); it is `aria-hidden` and the exact copy sits in the hidden span, as tested in step 3.
- Cost: `react-dom`'s `flushSync` (already a dependency) — no new package. JS 285.53 → see build line.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 108 passed; `npx playwright test` 558 passed
  (Chromium + WebKit; new `e2e/morph.spec.ts`, 7 cases × 2 engines: one transition per track change +
  cassette animations run, pass-through for non-track changes, no-morph theme, reduced motion, unsupported
  fallback, rapid changes, no-opacity/guard); `npm run build` OK incl. `check-fixtures-excluded: OK`.
  Visual result: **ready for review**.

## 2026-09-23 — Design round 2, step 6: physics debris (Matter.js), lazy-loaded

Step 6 of the T5 plan. **Contract v5 / THEME_CONTRACT.md not touched yet** (step 7): the `.mp-debris` part,
`data-fx-debris` and variant `effects.debris` exist in code but are undocumented until then.

- On a track change, the PREVIOUS title's letters drop out of the card, tumble, pile on the card's floor, fade and
  are destroyed after 2.8 s. **Decorative only:** the new title is always the normal static real text; the layer
  is `aria-hidden`, `pointer-events:none` (also guard-locked), clipped to the window, `z-index:-1` (behind the
  card's content, so the badge and controls always stay on top). Only characters of the replaced title are ever
  used (test: every debris letter is in the old title, and a letter that exists only in the old title — `k` —
  appears while one that exists only in the new title never does).
- **Bounded and self-cleaning:** ≤ 32 bodies (pure `layoutDebris` caps visible glyphs; whitespace advances the
  row but is never a body). Each spill creates its own Matter engine and destroys it afterwards
  (`Composite.clear` + `Engine.clear` + DOM removal); a newer spill or unmount cancels the running one at once
  (tested: cutting a spill mid-way replaces A's letters with B's, never a mixture, and the layer still ends
  empty). Fixed 60 Hz step with a 50 ms clamp so a stalled frame can't cause a huge jump. Physics is seeded from
  the old title (`mulberry32(hash)`), so the same title always tumbles the same way.
- **Matter.js is lazy-loaded** (`await import("matter-js")`, MIT, 0.20.0): a separate chunk, **83.77 kB / 26.23 kB
  gzip, fetched only on the first spill**; a test asserts it is NOT requested before the first track change.
  Main bundle 285.53→290.45 kB / 93.70→95.60 kB gzip (+1.9 kB gzip for the component itself). Users who never
  enable the effect pay nothing for the engine.
- Timing: in T5 (which has the morph on) the spill starts 650 ms after the swap so it happens as the new card
  lands; without the morph it starts at once. Skipped when the document is hidden and under reduced motion.
- `FxSettings.debris` / variant `effects.debris` (boolean) / harness checkbox / `?fx=debris`; T5 `fx` default is
  now `{ title: splitflap, flow, morph, debris }`.
- Files: `src/fx/Debris.tsx` (Matter + DOM), `src/fx/debrisLayout.ts` (pure, 7 tests). **Naming trap hit:** I first
  called the pure module `debris.ts` next to `Debris.tsx` — on Windows' case-insensitive filesystem TypeScript
  rejected it as the same file (TS1149). Renamed to `debrisLayout.ts`.
- **Second environment trap, worth remembering:** after that rename the long-running Vite dev server kept serving
  the stale `/src/fx/Debris.ts` module path (error: "does not provide an export named 'Debris'") and every e2e
  test failed to render the harness. A dev-server restart fixed it; it was not a product bug. Playwright's config
  *reuses* a running dev server, so a stale one silently poisons the whole e2e run.
- **Looked at:** in Playwright's Chromium, mid-spill stills show the old title's letters ("FIXTURE-ONLY-DEV-
  BUILD Track Title") tumbled into a pile on the card's floor with the badge visible above them; the new card's
  flap board, flow backdrop and controls are untouched. WebKit's appearance is not looked at (tests only).
- Honest limits: the spill starts from an *approximation* of where the old title sat (canvas-measured glyph row
  centred in the title box — for the flap title that is not the tile grid), and the pile is randomised physics,
  not a designed composition. The old card in the cassette-swap has already left by the time letters spill.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 115 passed (7 new); `npx playwright test` 572 passed
  (Chromium + WebKit; new `e2e/debris.spec.ts`, 7 cases × 2 engines, 42/42 over `--repeat-each=3`: old-title letters
  only + contained + decorative, moves then cleans up fully, lazy chunk, mid-spill cut, same-title no-op,
  no-effect theme, reduced motion); `npm run build` OK incl. `check-fixtures-excluded: OK`.
  Visual result: **ready for review**.

## 2026-09-23 — Design round 2, step 7: contract v5 + docs (T5 plan complete)

Final step. Everything from steps 2–6 is now documented and versioned in one change, as CLAUDE.md requires.

- `CONTRACT_VERSION` 4→5 (`src/theme/variant.ts`) and all five `theme.json` `contract` fields, plus the variant
  JSON in `e2e/fx.spec.ts` / `e2e/flow.spec.ts` that hard-coded the number. Purely additive; nothing renamed or
  removed, so a v4 theme/variant only needs its `contract` number bumped.
- `docs/THEME_CONTRACT.md`: version/status/changelog; Root (`data-fx-flow|morph|debris`, `splitflap` value);
  Theme tokens (`--mp-flap-bg|fg|edge`, incl. the AA requirement for the tile pair); Parts (`.mp-flow`,
  `.mp-debris`, and `.mp-fx-filters` now naming the three artwork filter ids and their caveats); `theme.json`
  field table (`fx`; stale example's `"contract": 1` → 5); **Effects** rewritten for v4+v5 (split-flap rules,
  the flow backdrop, the track-change transition convention — app starts the view transition, the *theme* names
  `.mp-window` and styles the pseudo-elements, transforms not opacity — and debris); Variants (`effects` example
  and validation rules). `docs/PLAN.md`: D16 widened, T5 added to the theme roster. `docs/COPY.md`: labels for
  split-flap / flow / morph / debris as `[NEEDS COPY]`.
- **Tests now make the doc fail loudly (new `src/theme/contractDoc.test.ts`, 8 cases, no browser):** version line and
  a changelog entry exist for `CONTRACT_VERSION`; a `data-fx-<key>` Root bullet exists for every key in
  `EFFECT_KEYS`; every `TEXT_FX` value is on the `data-fx-title` bullet; every `ART_FILTER_IDS` id is on the
  `.mp-fx-filters` part; the flap tokens and `--mp-beat` are documented; every top-level field of every shipped
  `theme.json` has a row in the field table; and **every `--mp-*` custom property that `src/fx/*` or
  `structure.css`/`guard.css` mention appears in the doc**. Mutation-checked: deleting the debris Root bullet,
  misspelling `#mp-art-dither`, and renaming the `fx` field row each turned a different case red; the doc was then
  restored. `e2e/contract.spec.ts` now renders one fixture with EVERY effect on (`shapes, waveform, flow, morph,
  debris, ripple, typewriter`) so the Parts/Root comparisons include the v5 ones — it passed with `.mp-flow`,
  `.mp-debris` and the four new attributes documented.
- Regenerated the review sheets (`npm run review`, 192 captures): new `e2e/review/sheet-7-t5-kinetic.png` (all 22
  fixtures × Chromium and WebKit). They are **static frames** built from URL-driven cells, so they show T5's body,
  reels and controls but NOT the theme-default effects (flap, flow, morph, debris need the harness), and nothing that
  moves. Looking at the sheet: WebKit renders the same layout with plain rounded corners (no `corner-shape`), as designed.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 123 passed; `npx playwright test` 572 passed (Chromium +
  WebKit); `npm run build` OK incl. `check-fixtures-excluded: OK` (main JS 290.65 kB / 95.65 kB gzip + a lazy
  83.77 kB / 26.23 kB gzip Matter.js chunk fetched only on the first debris spill).

### Design round 2 — status
**Built and logged (steps 0–7):** S9 spike; T5 "Kinetic" tape deck (squircle body, progress-driven reels, keycap
controls); live artwork treatments (duotone default; posterize, dither); split-flap title on `@splitflap/core` with a
real-letters-only flip alphabet; real-text flow backdrop wrapped around the reels by native `shape-outside` (Pretext
measured and rejected); cassette-swap view transition (transforms only, no fade); lazy Matter.js debris of the previous
title; contract v5 + tests that keep the doc honest.
**Still open / not done:** watching the *live motion* of flaps, reels, morph and debris in a real Tauri window (I saw
stills and DOM/animation state, not a running window); WebKit's/WKWebView's look and view-transition behaviour on a real
Mac; whether WebView2 on your machine is new enough for `corner-shape`/view transitions (this dev pane is Chrome 152);
your call on the split-flap in-between-glyph reading (I took the conservative one); the typewriter-ellipsis limitation;
no customizer UI/persistence or Rust theme loader (Phase 4/5) — effects are applied by the dev harness only;
`@splitflap/core` is a 0.1.x library; T1–T4 have not been re-reviewed with the v4/v5 effects switched on.

## 2026-09-23 — Slice 1: the real app applies and remembers a theme
- **Was:** `App.tsx`'s production path hard-coded `layout="strip"`, `theme="t1-default"` (T1 has no strip CSS), and only the
  dev harness applied effects. Overrides/hidden parts were never applied anywhere.
- **Now:** `src/theme/registry.ts` (manifests, shared with the harness), `src/theme/appearance.ts` (pure
  load/validate/save of `{theme, variant}`; invalid or stale data falls back to the theme's defaults; switching theme
  clears overrides), `Player` takes `overrides` (inline custom properties) and `hidden` (`data-hide-<part>`), and
  production `App` reads the saved appearance. No contract part/attribute changed.
- **Storage choice:** webview `localStorage`, not `<app data dir>/variants/` yet (PLAN.md §4 says the latter). Chosen to avoid a new
  Rust command/plugin for a slice with no UI; variant *files* for export/import come with the customizer. Not yet verified
  to survive a restart in a real Tauri window (WebView2 persists localStorage per app; unconfirmed here).
- **Surprise:** `e2e/production.spec.ts` "corner pixel fully transparent" now fails (alpha 7, Chromium and WebKit). It only
  passed before because production rendered the unstyled `strip`; production now renders T1's card, whose window-level
  `box-shadow: 0 20px 48px rgba(0,0,0,.35)` paints a faint blur at the transparent corner. Unresolved — needs a call:
  drop that shadow, or relax the test to "no opaque rectangle".
- **Resolved (user said "continue" without choosing; I took the non-design option):** kept T1's shadow, relaxed the
  corner test from `=== 0` to `<= 24` (opaque rectangle = 255; measured 7). If you'd rather drop the shadow, revert that
  test line and remove `box-shadow` at `themes/t1-default/theme.css:62`.
- **Gap closed:** nothing proved the *production bundle* restores a saved appearance (unit tests only cover the pure
  functions). `e2e/production.spec.ts` gains two cases: seeded T5 + `--mp-accent` override + hidden `album` → after
  reload `.mp-root` has `data-theme="t5-kinetic"`, `data-layout="card"`, `data-hide-album`, the inline override and T5's
  manifest `data-fx-title="splitflap"`; garbage in storage → T1 and the stored value rewritten as a valid current-contract
  appearance. The storage key is written out in the test on purpose (changing it silently drops saved appearances).
  **Mutation-checked:** with `HEAD`'s `App.tsx` swapped back in, both new cases fail (received `t1-default`; stored value
  still unparseable), the two old ones pass; restored and re-run green.
- **Surprise (not fixed here):** `main`'s `tauri.conf.json` is still the scaffold window (800×600, decorated, not
  transparent, title `tauri-app`); the S1 window config lives on `spike/s1-window`. So every theme's `theme.json`
  `window` size is still unused, and the transparent-corner tests only model the real window. Belongs to the spike merge /
  Phase 4 "per-theme window resize", not this slice.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 129 passed (6 new in `appearance.test.ts`); `npm run build`
  OK incl. `check-fixtures-excluded: OK`; `npx playwright test` 572 passed (Chromium + WebKit, loaded before the two new
  cases were added), then `npx playwright test e2e/production.spec.ts` 8 passed (both engines, incl. the new cases).
- **Still open:** not run in a real Tauri window, so restart persistence in WebView2 is still unverified; no picker or
  customizer UI, so the only way to change the saved appearance is devtools/`localStorage`; storage is `localStorage`,
  not `<app data dir>/variants/` (see above).

## 2026-09-26 — Slice 2: the production player in a real native window
- **Was:** `main` still had the scaffold window (800×600, decorated, opaque, title `tauri-app`); every theme's `theme.json`
  `window` size was unused; nothing let you drag the frameless window (S1's handler lived only on `spike/s1-window`).
- **Now:** `tauri.conf.json` takes S1's learnings (`decorations: false`, `transparent`, `alwaysOnTop`, `shadow: false`
  per D11/C9, not resizable/maximizable, `center`), title `Stanza` (COPY.md "App identity"), initial size 340×600 = the
  default theme's. New `src/window/nativeWindow.ts`: `fitWindowToTheme` sets the window to the active theme's `window` in
  **logical** px (so DPI scaling applies) and `installWindowDrag` is C8's handler (primary press anywhere on `.mp-root`
  → `startDragging()`, except inside `button, input, a, [data-no-drag]`). Both are no-ops outside Tauri. Capabilities gain
  `core:window:allow-start-dragging` and `core:window:allow-set-size`. `ThemeManifest` now types `window` (every shipped
  theme already had it). No contract part/attribute/variable changed.
- **Trap found and avoided:** `%APPDATA%\com.stanza.app\.window-state.json` still held the scaffold window
  (`width: 812`, `decorated: true`). `tauri-plugin-window-state` restores *all* flags by default, which would have
  brought back a decorated 812×600 window over the new config. It is now limited to `StateFlags::POSITION` (what Phase 2
  added it for); size comes from the theme and frame from the config.
- **Anchoring (took the non-design option):** the player stays at the window's top-left, as in the harness, the review
  sheets and every e2e check. Consequence: T1's Collage (bleeds 96px past both sides of `.mp-window`) keeps its right-hand
  peek inside the reserved 340px but its **left** peek is clipped by the window edge. This contradicts THEME_CONTRACT.md's
  "reserving real margin … without being clipped once real native-window sizing is built" — needs your call: centre the
  player in the window (moves every theme's smaller states), or give T1 its own left margin in `theme.css`.
- **Surprise, needs a call — invisible click-blocking area:** the window is sized for the theme's *largest* state (the
  contract requires it: the native window can't resize on hover). In the real exe the idle T1 card is ≈280×245 inside a
  340×600 always-on-top window, so most of the window is transparent but still swallows clicks meant for what's
  underneath. Options: (a) resize the window to the rendered `.mp-window` (ResizeObserver; conflicts with the "fits every
  state, can't resize on hover" rule and T1's reserved margin); (b) toggle `setIgnoreCursorEvents` by pointer position
  (S8 territory, unverified); (c) accept for now. Not fixed here.
- **Automated (production bundle, Tauri IPC replaced by a recorder in `e2e/production.spec.ts`):** launch asks for
  `set_size {Logical: 340×600}` (T1) and `320×490` for a saved T5; a press on the player starts a drag, while presses on a
  button / range input / link / `[data-no-drag]` child / outside `.mp-root` / a right-click don't; in a plain browser
  there are no errors. **Mutation-checked:** swapping height for width in `fitWindowToTheme` and disabling the no-drag
  exclusion turned all three Tauri cases red; restored and re-run green.
- **Real exe (ran):** `npm run tauri build -- --no-bundle` (2m 12s, no Rust warnings) → launched
  `src-tauri/target/release/tauri-app.exe` and read the window via Win32: title `Stanza`, outer = client = 340×600 at
  DPI 1.0 (no frame; `WS_CAPTION` bits are set but the non-client area is zero, and the capture shows no title bar),
  topmost, no thick frame, position restored (234,234), stale saved size/decoration ignored, graceful exit. Screen capture:
  rounded corners and everything outside the card show the desktop behind — transparency works; T1's ambient shadow shows
  no hard cut-off at the window edge. WebView2's `Local Storage\leveldb\000003.log` contains `mp.appearance.v1` with
  `t1-default`, written this run — the appearance does reach disk.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 129 passed; `npx playwright test` 584 passed (Chromium +
  WebKit, 12 new production runs); `npm run build` OK incl. `check-fixtures-excluded: OK` (run by the tauri build).
- **Not verified:** dragging the real window (I did not inject mouse input into your desktop — needs your hand);
  125/150% display scaling (this machine is at 100%); a *non-default* saved theme being read back after a restart (no
  picker, and the release build has no devtools to seed one); multi-monitor. **macOS: untested** — and `transparent`
  there also needs `macOSPrivateApi: true` (C6), not set. Still open from S4: CSP is `null` in `tauri.conf.json` and must
  be set (only enforced in release builds). `productName` is still `tauri-app` (exe/installer name); the WebView2 data dir
  follows the identifier `com.stanza.app`, so renaming it later won't lose saved appearances.

## 2026-09-27 — Slice 3: clicks pass through the transparent part of the window
- **Was (Slice 2's open call):** the window is sized for the theme's largest state, so the idle T1 card (≈280×245)
  sat in a 340×600 always-on-top window whose whole rectangle swallowed clicks meant for what was underneath.
- **Choice (you said "continue" without picking; I took the only option with no design or contract change):** (b),
  click-through by cursor position. (a) resize-to-fit breaks the contract's "the window fits every state" rule and T1's
  reserved margin; (c) leaves the bug.
- **Now:** new `src-tauri/src/hit_region.rs`. The command `set_hit_region` stores the player's boxes (logical px,
  window-relative), and a thread polls every 30 ms. It calls `set_ignore_cursor_events(true)` only while the cursor is
  outside every box, and only when that changes. With no region, an empty region, zero-area boxes or a bad scale factor,
  it never ignores, so a frontend failure can't leave an unclickable window. Frontend: `installHitRegion` in
  `src/window/nativeWindow.ts` reports the border boxes of `.mp-root` and `.mp-root > .mp-window`. It re-measures on a
  ResizeObserver hit, an attribute change on either part (not their subtree, where effects write per-frame
  `--mp-beat`), `transitionend`/`animationend`, and window resize, and sends only when the boxes changed.
- **Why `.mp-root` ∪ `.mp-window`, not `.mp-window` alone:** `data-hover` comes from pointer enter/leave on `.mp-root`.
  A hit area smaller than `.mp-root` could stop the webview's mouse events while the pointer is still inside
  `.mp-root`, leaving `data-hover` stuck on. Bleed past the boxes (T1's Collage, shadows) is click-through.
  THEME_CONTRACT.md gets a note after the field table. There is no version bump because no part, attribute or variable
  name changed; the note documents app behaviour.
- **Surprise: tao's ignore is `WS_EX_TRANSPARENT | WS_EX_LAYERED` with no `SetLayeredWindowAttributes` call.** On a
  classic window that makes it invisible. With WebView2 content it doesn't: captures show the card drawn in both states.
  `GetLayeredWindowAttributes` reported no attributes on the first toggle and `alpha=255, LWA_ALPHA` on later ones.
  Something sets them, presumably WebView2 or DWM; I didn't investigate.
- **Surprise: polling through Tauri's getters cost ~1% of a core.** `cursor_position`, `inner_position` and
  `scale_factor` each round-trip the main event loop. Idle CPU of the app process per 10 s:
  - Tauri getters: 94 / 109 / 94 / 94 ms
  - Slice 2 build (no poller): 0 ms, 8 runs (the timer resolution is ~16 ms)
  - Windows syscalls on the poll thread (`GetCursorPos`, `ClientToScreen`, `GetDpiForWindow`; HWND fetched once): 0 to
    47 ms over 7 runs of the final build, median 16 ms
  The non-Windows path keeps the Tauri getters (**macOS untested**; its CPU cost there is unmeasured). New direct
  dependency: `windows` 0.61 with four features tao already enables. `Cargo.lock` gains one line and nothing new is
  compiled.
- **Surprise (a bug in my own probe):** the first flicker measurement reported 0 difference, but it was invalid. In
  Windows PowerShell `diff` is a built-in alias for `Compare-Object`, and aliases outrank functions, so my `Diff`
  function never ran; the probe compared two Bitmap objects by type name. I renamed the function and re-ran it with a
  control.
- **Saved position moved without my probe moving it:** between two of my runs, the saved window position changed from
  (234,234) to (2658,-300), probably a second monitor. Most likely you dragged the window while one of my CPU runs had
  it on screen. Every probe put the window back where it launched before closing, so the saved position is whatever it
  was at launch.
- **Real exe (ran, final build):** `tauri build --no-bundle`, 0 warnings. The Win32 probe moves only the Stanza window,
  never the cursor. It reads the cursor, puts the window so the cursor lands on a given local point, waits 400 ms, and
  then reads the ex-style bits and `WindowFromPoint`:

  | Cursor | Transparent + layered bits | `WindowFromPoint` |
  |---|---|---|
  | On transparent area (170,560) | both set | the app underneath (Spotify) |
  | On card (140,120) | both clear | Stanza |
  | Right of card (330,20) | both set | the app underneath (Spotify) |
  | On card (20,20) | both clear | Stanza |

  Flicker probe, run on the syscall build before the attribute watch was added (a frontend-only difference): 20 of
  20 toggles observed. 60 frames captured right after the toggles differ from
  the steady card by a mean of 0 RGB, while the control (card moved away) differs by 30.7. GDI captures land every
  ~10–30 ms, so a flash shorter than a frame could be missed. The app exits cleanly with code 0.
- **Automated:**
  - `cargo test`: 4 unit tests of the hit math, covering edges, 125%/150% scaling, a monitor at negative x, and never
    ignoring without a usable region.
  - `e2e/production.spec.ts` (IPC recorder): the boxes are reported at launch and are smaller than T1's 340×600 window.
    The region follows a grow, a shrink back, and an instant transform, and it is not re-sent while unchanged.
  - **Mutation-checked, each restored afterwards:** disabling the ResizeObserver fails the growth test; never reporting
    fails both tests; dropping the attribute watch fails the transform step.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 129 passed; `cargo test` 4 passed; `cargo clippy
  --all-targets` 0 warnings; `cargo fmt --check` clean; `npx playwright test` 588 passed (Chromium + WebKit, 4 new
  runs); `npm run tauri build -- --no-bundle` OK, including `check-fixtures-excluded: OK`.
- **Not verified:**
  - Real mouse use: the ≤30 ms hover latency when entering the player, and a real click on the transparent area landing
    in the app underneath. The probe shows Windows' hit test picks that app, but I injected no clicks.
  - 125%/150% scaling and mixed-DPI monitors (unit-tested math only).
  - macOS.
  - The box is a rectangle, so the corners outside the card's radius (16–40 px depending on theme) still take clicks.
- **Relation to S8 (PRIORITIZATION_PLAN.md):** this answers S8's hit-testing question for rectangles: clicks pass
  through outside a region. It does so with cursor-polled ignore rather than `SetWindowRgn`, which would also clip
  painting (shadows, the Collage). Arbitrary silhouettes remain open.
- **Still open:**
  - From Slice 2: T1's Collage is clipped on the left (your call: centre the player, or give T1 a margin); CSP is still
    `null`; `productName` is still `tauri-app`.
  - The theme picker is blocked on copy: every shipped `theme.json` `name` is `[NEEDS COPY]`, so a picker would show
    five identical labels.

## 2026-09-27 — Slice 4: theme picker (right-click menu) and placeholder theme names
- **Names (doc conflict, your instruction wins):** you said "name the themes anything for now". CLAUDE.md says never
  to generate displayed text, so I invented nothing and used the working names PLAN.md's roster and DECISIONS.md
  already used: **Default** (T1's roster name, since you'd pushed back on "Ring + Depth"), **Glow Card**, **Micro
  Pill**, **Extreme**, **Kinetic**.
  - They are listed in COPY.md's new "Theme names (first-party)" section, marked as placeholders. Each theme.json
    `name` must equal its entry, checked by `src/theme/registry.test.ts`.
  - `author` is untouched: still `[NEEDS COPY]` and unused.
  - THEME_CONTRACT.md's `name` row now says what shows it. No version bump, since no part, attribute or variable name
    changed.
- **Picker (first cut):** right-clicking the player (or Shift+F10 / the Menu key) opens a native menu at that point.
  It is made with Tauri's JS menu API: check items listing every theme by `name`, the active one checked.
  - The names are its only text, so it needs no other copy.
  - Picking a theme calls `selectTheme`, which clears the old theme's overrides (PLAN.md), and saves at once.
  - The window first grows to the union of the old and new sizes, so neither theme is clipped while React swaps them.
    After the new theme renders it takes its exact size, and a size already requested isn't requested again.
  - Outside Tauri the browser's own context menu is left alone.
  - PLAN.md Phase 4 asks for a "theme picker with previews". Previews wait for a settings window, which needs copy for
    its chrome.
- **Judgement call:** right-clicking on the artwork opens the menu over the artwork box. CLAUDE.md's rule is about
  interactive controls sitting on or over the artwork, and `e2e/contract.spec.ts` checks DOM controls. A transient OS
  menu the user summoned isn't one, and that check still passes. Flagging it in case you read the rule more strictly.
- **Surprise: a real deadlock, found only in the real exe, fixed.**
  - **Symptom:** the second right-click after picking a theme hung the app, with its menu on screen. It happened twice.
    The main thread sat in a lock wait, not in the menu's message loop.
  - **Cause, from Tauri 2.11.5's source:**
    - `plugin:menu|popup` is async. It holds the webview's resource table (`webview.resources_table()`) while
      `popup_inner` runs the modal menu on the main thread, and waits for it to close.
    - `plugin:resources|close` and `plugin:menu|new` are synchronous commands. Tauri runs those on the main thread, and
      they need the same table.
    - My first version closed the previous menu without awaiting it, racing the new popup. When the popup won, `close`
      landed on the main thread inside the modal loop and waited on a lock held by the thread waiting on the main thread.
  - **Fix (`src/window/themeMenu.ts`):** strictly one step at a time. Each request awaits the previous menu's close,
    then creates the menu, then shows it. Requests arriving while one is in flight are dropped (`popup` resolves only
    when the menu closes), and nothing touches the resource table while a menu is open.
  - **Regression test:** in the e2e fake, `popup` now stays pending until the test closes the menu, as Tauri's does. The
    test asserts no resource commands while a menu is open, extra right-clicks dropped, and close → new → popup in that
    order. Mutation-checked: the old `themeMenu.ts` fails exactly this test.
  - **Why fake IPC missed it:** in the fake, `popup` resolved instantly. That is a limit of testing through fake IPC,
    so the real-exe drive below is the check that counts.
- **Surprise: UI Automation sees the menu as an empty Pane.** muda draws the items itself, so there's nothing to expose.
  Screen readers probably can't read the theme names. **Open accessibility issue, not fixed.**
- **Surprises in my own test harness (no product impact):**
  - A WebView2 browser process can outlive `tauri-app.exe` when the app is closed with a menu open or killed. A new
    instance launched with different WebView2 arguments then joins it, and starts slowly or fails. The driver now waits
    for all Stanza processes to exit between launches.
  - `$out` in my PowerShell probe collided with its own `-Out` parameter; PowerShell names are case-insensitive.
  - An interrupted run left your saved theme as Micro Pill. The final run re-selected Default through the menu and
    confirmed it after a restart.
- **Real exe (ran), `tauri build --no-bundle` with 0 warnings:**
  - **How it was driven:** launched with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port`. Right-clicks
    were dispatched into the page over CDP, which fires the real `contextmenu` event without moving the OS cursor. The
    real native menu was read with Win32 (`MN_GETHMENU`, `GetMenuString`/`GetMenuState`) and driven with posted Down and
    Enter keys to the menu window. Window sizes were read with `GetClientRect`.
  - **Menu:** shows `Default ✓, Glow Card, Micro Pill, Extreme, Kinetic`, found 79–85 ms after the right-click.
  - **Picking Micro Pill:** `data-theme="t3-pill"`, the pill layout, a **248×86** window, and saved to storage.
  - **Second right-click (the case that deadlocked before):** the menu opens with Micro Pill checked, and Escape closes
    it.
  - **Restart:** Micro Pill comes back at 248×86. This is the first real check that a *non-default* saved theme
    survives a restart, open since Slice 1.
  - **20 swaps** cycling all five themes: every one landed at its theme's exact window size, with no page errors.
  - **Exits:** the app closes in 45–55 ms.
  - **Memory (PLAN.md Phase 4 gate "roughly flat"):** private memory is summed over the app and its six WebView2 processes; the JS heap is measured after a forced GC.

    | | Private memory | JS heap |
    |---|---|---|
    | Launch | 171.0 MB | 2.66 MB |
    | Every theme visited once | 198.6 MB | 3.09 MB |
    | After 20 more swaps | 205.5 MB | 3.45 MB |
    | After 40 more swaps | 203.4 MB | 3.53 MB |

    - Visiting each theme the first time costs about 28 MB, mostly the GPU process (+22.6 MB).
    - After that it plateaus: +6.9 MB over the next 20 swaps, then −2.1 MB over the 20 after that.
    - DOM nodes (72–73) and event listeners (179) stay flat.
    - The first run's single before/after (169.9 → 206.4 MB) was that one-time first-visit cost, not a leak.
- **Automated:**
  - `src/theme/registry.test.ts`: names match COPY.md; mutation-checked with a drifted name.
  - `src/window/themeMenu.test.ts`: order, the checked item, and `[NEEDS COPY]` rather than the id for a missing name.
  - `e2e/production.spec.ts` (IPC fake with real channel callbacks), 5 new tests: menu contents, position and
    suppression of the webview's menu; the switch (clears overrides, saves, resizes smaller in one step, grows first
    T5→T4); the deadlock regression; 20 swaps with at most one live menu; the browser menu untouched outside Tauri.
  - **Mutation-checked, against the final code:** dropping the pre-grow fails the switch test; never releasing old
    menus fails the regression, switch and 20-swap tests; the old racing release fails the regression test.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 132 passed (3 new); `npx playwright test` 598 passed
  (Chromium + WebKit, 10 new runs); `npm run tauri build -- --no-bundle` OK with 0 warnings, including
  `check-fixtures-excluded: OK`. No Rust changed this slice.
- **Not verified:**
  - A real OS mouse right-click and a mouse click on an item. Both were driven through CDP and posted keys; the menu
    itself is the real native one.
  - Where the menu appears on screen: the click point is passed, but I didn't look at it.
  - Shift+F10 in the real exe.
  - 125%/150% scaling, and macOS (the popup-blocks-until-closed assumption is also untested there).
  - Screen readers (see above).
  - Whether a swap ever shows a clipped frame: the order of operations is tested, but no frame capture was taken.

## 2026-09-27 — Slice 5: a real content security policy, and the app is named Stanza
- **Was:** `csp: null` (open since S4; any page script could load anything), and the product was still the scaffold's
  `tauri-app` (exe name, Task Manager description, future installer name).
- **CSP now** (`tauri.conf.json` `app.security.csp`), the S4 spike's policy tightened to what the app loads today:
  `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'
  ipc: http://ipc.localhost; object-src 'none'; base-uri 'none'; form-action 'none'`.
  - **`img-src data:` is required, not a leftover.** The always-rendered `.mp-fx-filters` dither filter loads a
    canvas-generated `data:` PNG through `feImage` (`src/fx/artFilter.ts`). Removing it makes the e2e test fail with
    `img-src data`.
  - **`connect-src ipc: http://ipc.localhost`** is Tauri's IPC.
  - **Dropped from S4's policy:** `blob:` and `asset:`. They were for the runtime theme loader, which isn't on `main`
    yet. The asset protocol isn't enabled either, and S4 wrote `https://asset.localhost` where Tauri v2 on Windows
    serves `http://`, which needs checking when the loader lands.
  - **Scan:** nothing in `src/` sets `style=` through markup, injects `<style>`, or uses eval/`new Function`.
    anime.js, Matter.js and `@splitflap/core` don't either (splitflap only clears `innerHTML`). React, anime.js and the
    effects write styles through the CSSOM, which `style-src 'self'` allows.
- **Rename:** `productName` "Stanza" (COPY.md's approved app name). The Cargo package becomes `stanza` (the exe is now
  `stanza.exe`), with lib `stanza_lib`, and the npm package becomes `stanza`.
  - The Tauri schema recommends renaming the package over `mainBinaryName`, and that also covers `tauri dev`.
  - `productName` sets the exe's ProductName and FileDescription, which is what Task Manager shows.
  - The identifier stays `com.stanza.app`, so WebView2 storage (the saved appearance) and the window-state file are
    untouched.
  - The old `target/release/tauri-app.exe` is left over from earlier builds and is stale.
- **Real exe (ran):** **pending.** When I went to run it, your own `tauri-app.exe` (the Slice 4 build, opened from Explorer at
  20:34) was running. A second instance would share its WebView2 profile, and with it the saved theme, so I didn't start
  one. The checks run once you close yours, and the results are added below. What I did check without launching:
  `stanza.exe`'s version info reads ProductName "Stanza", FileDescription "Stanza", CompanyName "stanza", 0.1.0 (the old
  exe reads "tauri-app").
- **Automated:** `e2e/production.spec.ts` serves the production bundle with the header read from `tauri.conf.json`,
  walks all five themes through the (fake-IPC) menu, and asserts no `securitypolicyviolation`. A canary remote image
  must then be blocked, so an unenforced policy can't pass it. It passes on both engines. Mutation-checked: dropping
  `data:` from `img-src` fails it (`img-src data`).
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 132 passed; `cargo test` 4 passed; `cargo clippy --all-targets`
  0 warnings; `cargo fmt --check` clean; `npx playwright test` 600 passed (Chromium + WebKit, 2 new runs); `npm run tauri
  build -- --no-bundle` OK with 0 warnings, including `check-fixtures-excluded: OK`, producing `stanza.exe`.
- **Not covered:** a real track isn't possible yet (no adapter), so these paths haven't run under the CSP in any
  build:
  - loading artwork into `<img>` plus palette extraction on a canvas
  - flow, split-flap and debris with real text; the lazy Matter.js chunk
  - the morph view transition
  The scan above found nothing they would trip, and the lazy chunk is a same-origin script. Re-run the CSP e2e check
  once an adapter feeds tracks: GSMTC thumbnails will likely arrive as `data:`/`blob:` URLs or through the asset
  protocol, and `img-src` will need whichever it is. **macOS untested.**

## 2026-09-27 — Slice 6: the player is centred in its window (side to side), pinned to the top
- **Was (Slice 2's open call):** the player sat at the window's top-left. T1's Collage layer bleeds 96 px past both
  card edges, and T1's 340 px window leaves 60 px spare, so the bleed was clipped 96 px on the left and 36 px on the
  right.
- **Your call:** "center it".
- **My reading, measured first.** Every theme's `.mp-window` width is constant across all 22 fixtures, idle and
  hovered (T1 280, T2 280, T3 248, T4 282, T5 320). Heights vary a lot: T1 244–572, T2 186–507, T3 48–86 (hover),
  T4 218–528, T5 194–484. So:
  - **Horizontal centring:** never moves the card, gives T1 30 px on each side, and is a no-op for T2–T5, which fill
    their width.
  - **Vertical centring:** would move the card's top edge by up to 164 px (T1) whenever a track starts or stops, a
    title wraps differently, or T3's hover-reveal opens.
  I centred **side to side only** and kept the top pinned. If you did mean vertically too, it's one CSS line
  (`align-items: center` plus a full-height `.app-stage`), and the jump above would come with it.
- **Now:** production wraps the player in `.app-stage` (`src/App.css`: flex, `justify-content: center`,
  `align-items: flex-start`). The dev harness and the review sheets keep their own layout. No contract part,
  attribute or variable changed.
  - THEME_CONTRACT.md has a new paragraph, "Where the player sits in the real window": keep `.mp-window`'s width
    constant across states; heights may vary.
  - T1's paragraph there now says what actually happens: 30 px shows past each card edge, and the rest is clipped
    equally on both sides.
  - The hit region needed nothing: it already reports the boxes wherever they are.
- **Automated:**
  - `e2e/production.spec.ts`, 5 new tests (one per theme): each at its declared window size, the card must be
    centred (±0.5 px) with its top at 0.
  - For T1 the Collage's left and right overflow must be equal (±1 px).
  - The hit-area test now runs at T1's real 340×600 viewport and also requires margin on the left.
  - **Mutation-checked:** with `justify-content: flex-start`, the T1 test and the hit-area test fail, and T2–T5 still
    pass because they fill their width.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 132 passed; `npx playwright test` 610 passed (Chromium +
  WebKit, 10 new runs); `npm run tauri build -- --no-bundle` OK with 0 warnings, including `check-fixtures-excluded:
  OK`.
- **Not yet run in the real exe:** your own old `tauri-app.exe` is still open (see Slice 5). The pending real-exe drive
  now also measures T1's placement and takes a capture; the results will be added here.

## 2026-10-17 — Plan v2: real music first, then a companion creature (docs only)
- **Why:** you asked where we are and to revamp the plan around a new feature: a small companion creature, like the
  pixel pet on Claude's chat box. It walks, sits and hangs inside the player's frame and outside it (your sketch:
  hanging under the bottom edge), has skins, and uses original designs we work out together. `docs/PLAN.md` was still v1
  (2026-09-11, "planning, nothing built yet"), and `docs/PRIORITIZATION_PLAN.md` was a second, competing plan.
- **Your four answers:** real Spotify data comes first (D18); pixel art; "watch + pick up" (click for a reaction, drag
  and drop it); it roams around the player only, not the whole desktop.
- **PLAN.md v2:** new status header; D17 (companion), D18 (order), D19 (one plan); the companion spec and architecture as
  a new §4b; §5 now holds the status, a v1-phase → milestone table and milestones M0–M6 with gates; the definition of
  done, risks, parking lot, open questions and sources updated. Stale lines fixed: the capability matrix (seek and
  shuffle were confirmed by S2), palette extraction living in TS rather than a Rust `ArtworkService`, the
  contract-version mentions, the storage note (Slice 1 uses `localStorage`). The v1 "CLAUDE.md seed" was removed: it
  still had the pre-2026-09-22 artwork rule, and `CLAUDE.md` itself is the live copy.
- **Deviation from the approved plan:** it said "new §5 Companion, §6 Status + roadmap". About 40 code comments (in 29
  files) and many older entries here cite PLAN.md by section number (`§3`, `§4 roster`, `§9`, "Phase 3 gate"). Renumbering would have
  pointed them at the wrong sections. So §0–§11 keep their v1 numbers, the companion is **§4b**, the roadmap replaces the
  phases inside **§5**, and the v1 phases survive as a history table there.
- **Where `PRIORITIZATION_PLAN.md` went (file deleted; it is in git history):**
  - Skip (next/prev): already worked in the S2 spike; it ships with M1 R1.
  - S5 per-app volume (Core Audio) and S6 lyrics button (bring Spotify's window forward): M1 R3.
  - S7 genre-based fonts (narrow D7 exception, needs your Spotify app credentials): M3.
  - S8 non-rectangular windows: rectangular click-through was answered by Slice 3; arbitrary silhouettes are parked
    (PLAN.md §9).
  - The withdrawn Valorant overlay item stays dropped.
- **Companion architecture (D17), decided before any code:**
  - **Window:** one window, grown by a margin the size of the pet. The page pads by it and the window shifts so the card
    doesn't move. A second pet window was rejected: it would lag behind a dragged player.
  - **Art:** pixel grids stored as data and rendered as crisp SVG, coloured by `--mp-pet-*`. One art pixel is always a
    whole number of device pixels, so 125% and 150% scaling stay even.
  - **Behaviour:** a pure seeded state machine (reusing `hashString`/`mulberry32` from `src/fx/beat.ts`); CSS-only frames
    and movement.
  - **Where it can be:** edges measured from `.mp-window`, plus an optional theme-declared inner ledge.
  - **Rules:** it never overlaps the artwork, controls or source badge, because CLAUDE.md's artwork rule applies to it
    (it is interactive).
  - **Contract:** v6 lands with the first slice that puts companion parts in the production DOM (C2), not batched at
    the end like D16's v4/v5.
- **Research (inspiration only, nothing copied):**
  - Shimeji-ee (BSD): action/behaviour split, Fall/Dragged/Thrown.
  - eSheep (clone): edge walking, pick up and drop.
  - oneko.js (MIT): tiny frame grids.
  - vscode-pets: colour-variant skins (its art belongs to credited artists).
  - VS Code's chat pet sprite rules: integer pixel units, palette skins sharing one body, an attachment rig, still poses
    for reduced motion.
  - Codex pets/Petdex: manifest + frames as an installable format.
  - WindowPet (MIT, Tauri + React): proof the overlay approach works.
  - BongoCat (MIT, Tauri) and VPet.
  - Links and license notes are in PLAN.md §4b/§11. Some licenses (vscode-pets, the eSheep clone) could not be confirmed
    from the pages read, which is fine because only ideas are taken.
- **COPY.md:** a new "Companion" section with six `[NEEDS COPY]` slots (creature name, menu labels, settings title). I
  wrote no wording.
- **Untouched:** code, THEME_CONTRACT.md, CLAUDE.md.
- **Not done:** the Slice 5/6 real-exe check is still pending (it needs your Stanza exe closed) and now rides on M1's
  first real-exe run.

## 2026-10-17 — M1 R1: the real Spotify adapter on `main`
- **Was:** the production app always rendered `IDLE_NOW_PLAYING`. GSMTC lived only on `spike/s2-gsmtc` (S2 passed
  2026-09-16 and was never merged, by the "merge learnings, not code" rule).
- **Now:**
  - **Rust: new `src-tauri/src/spotify/`.**
    - **`gsmtc.rs`:** one worker thread owns the GSMTC session manager and Spotify's session.
      - Windows' change events and the frontend's commands both arrive as channel messages, so no WinRT call runs on
        the main thread. The spike ran its commands there.
      - A burst of events, such as a track change, is read and published once.
    - **`mod.rs`:** the wire type, the commands (`spotify_state`, `spotify_play_pause`, `spotify_next`,
      `spotify_previous`, `spotify_seek`) and the pure helpers.
    - **Off Windows:** nothing starts, the state stays "no session" and every command answers false. **macOS
      untested** (M5).
  - **TS:**
    - **`SpotifyAdapter`** (`src/adapters/spotifyAdapter.ts`) listens to `spotify:state` *first* and then pulls,
      so no change can fall between the two.
    - **`SpotifyFeed`** (`spotifyFeed.ts`, pure) orders pulls and events by `seq` and maps them to `NowPlaying`.
    - **Production `App`:** builds a `PlayerStore` with the adapter (Tauri only; a plain browser stays idle),
      re-interpolates the position every 250 ms while playing (C10; no timer when paused), and wires
      play/pause, next and previous.
    - **`PlayerStore.stop()`:** disconnects the adapter on unmount.
- **Three spike bugs not carried over:**
  1. It added a fresh set of event handlers on every session-list change and never removed any. Now the old
     registrations are removed before a new session is followed.
  2. When Spotify closed, it kept showing the last track. Now a missing session publishes "no session".
  3. It re-read and re-encoded the artwork on every timeline event. Now artwork is read only on a media change, and
     it gets an id (a new id only when the image bytes differ). An event carries the base64 only when the id
     changed; a pull always carries it.
- **Two things the spike got wrong about C10, fixed and unit-tested:**
  - It stamped the position with "now" at read time. GSMTC's `LastUpdatedTime` is what the position is current as of,
    so it is now converted from WinRT ticks, falling back to now when unset or in the future.
  - **Resume guard:** on paused → playing with a timestamp older than 1 s, the position counts from now.
    Otherwise, if Spotify resumes without refreshing its timeline, interpolation would jump ahead by the whole pause.
    It applies only from *paused*, since a first read's old timestamp is genuine.
  - Whether Spotify actually needs the guard is for R2 to measure.
- **`Changing` (between tracks) keeps the previous status** instead of flashing idle.
- **Decided without asking (no design change):**
  - **No Spotify session, a stopped session or an empty title all show the existing idle state.** The contract's
    `unavailable` state shows only the badge, and COPY.md's "Spotify not running" is still `[NEEDS COPY]`. The
    dedicated state is R2.
  - **Caps:** `album` on, `seek` from GSMTC, and `shuffle`/`repeat`/`volume` off. The v1 contract has no
    shuffle/repeat controls, and volume is S5.
- **D5 kept:** the AUMID is matched by "contains spotify" and logged on attach, never hardcoded.
- **New dependencies:** `base64` (already in the lock file through Tauri). The `windows` crate gains the S2 spike's
  WinRT features (Foundation, Media_Control, Storage_Streams, Win32_System_WinRT), which compiles more of that crate.
- **Automated:**
  - **`cargo test`:** 7 new tests: AUMID match, status mapping incl. `Changing`, TimeSpan → ms, `LastUpdatedTime` →
    Unix ms, the resume guard, artwork mime sniffing (an unrecognised image → no artwork), the camelCase wire format.
  - **Vitest:** 8 new: the `NowPlaying` mapping, `seq` ordering (a slow pull after an event is dropped), artwork
    kept across events that omit it, a late pull still delivering the current image, `stop()`.
  - **`e2e/production.spec.ts`:** the IPC fake now answers `spotify_state` and can emit events. 6 new tests × 2
    engines:
    - listen-then-pull and the track shown with artwork, album and duration;
    - events update it, older ones are ignored, artwork survives, a track without artwork shows the placeholder,
      and Spotify closing shows idle;
    - the buttons send the commands and never start a window drag;
    - the time advances while playing and holds while paused;
    - no state yet → idle with no errors;
    - under the shipped CSP: a T5 track with `data:` artwork, palette extraction, and a track change that runs morph
      and lazy-loads Matter.js, with no violations.
  - **Mutation-checked:** pulling before listening fails the ordering test, and an unwired next button fails the
    transport test. Exactly those two failed; restored.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 140 passed (8 new); `cargo test` 11 passed (7 new);
  `cargo clippy --all-targets` 0 warnings; `cargo fmt --check` clean; `npx playwright test` 622 passed (Chromium +
  WebKit, 12 new runs); `npm run tauri build -- --no-bundle` OK with 0 warnings, including `check-fixtures-excluded: OK`.
- **Real exe (ran, read-only).** Your own Stanza wasn't running. I launched `stanza.exe` with a local CDP port and only
  read the DOM; no control was pressed and Spotify's playback was never touched by me.
  - **Spotify paused:** `data-status="paused"`, `data-source="spotify"`, `data-cap-seek`. Title, artist and album came
    through (text not logged here). The artwork was a 300×300 **PNG** (not JPEG), and the palette was extracted from
    it. Time 3:32 / 3:49.
  - **Live change:** playback then started (from your side) on a different track. The player followed it: playing, new
    artwork and palette, and the time advanced one second per second (0:04 → 0:07 over 3 s of samples).
  - **Pending Slice 5/6 checks, now done:**
    - The CSP is enforced in the exe: a remote canary image was blocked (`img-src`).
    - T1 is centred: card x = 30 in the 340×600 window.
    - The saved appearance survived the rename: `mp.appearance.v1` present, T1.
  - **Artwork size, a surprise:** Spotify's GSMTC thumbnail is a PNG of about **200–240 kB** (316,802 and 276,470
    base64 chars for the two tracks seen). That is far bigger than the "few dozen kB" assumed. Sending it only when
    the image changes, not with every timeline event, matters more than expected.
  - **CPU while playing:**
    - **Whole app (T1), 10 s:** ≈ 300 ms (≈ 3% of one core), spread over the WebView2 renderer/GPU processes:
      109 + 78 + 78 + 16 + 16 ms.
    - **`stanza.exe` alone:** 0 ms in that window.
    - **An earlier `stanza.exe`-only sample:** 391 ms. It most likely spanned the track change (artwork read +
      ~240 kB emit).
    - **No paused baseline yet:** it needs playback paused, which I won't do to your Spotify.
    - **Follow-up for R2:** compare the 250 ms position tick against a 1 s tick.
  - The app closed on a close request within 5 s, and its WebView2 processes were gone immediately after.
- **Not verified:**
  - **The M1 R1 gate itself:** 20 consecutive track changes with correct metadata. It means skipping tracks in your
    Spotify, so it waits for your OK, or for you to skip while I watch.
  - The transport buttons against real Spotify (only the fake IPC path is tested).
  - The Microsoft Store build of Spotify (AUMID).
  - 125%/150% scaling.
  - macOS (untested).

## 2026-10-17 — M1 R1 gate: 20 real track changes (passed)
With your OK ("you can skip through 20 tracks in my Spotify"), the release `stanza.exe` was launched with a local CDP
port, and **Stanza's own next button** was clicked 20 times over CDP. The OS cursor never moved. This tests the
transport path to real Spotify as well as the display.

After each click, the run waited for Stanza's track to change, gave it 1.2 s to settle, and then checked it against an
independent source: **Spotify's own main-window title** ("Artist - Title" while playing), read through PowerShell.
- **Changes:** 20/20 detected. Click → new track shown in 141–254 ms, median 197 ms.
- **Metadata:** 20/20 correct.
  - 18 matched Spotify's window title exactly.
  - The other 2 had an `ë` in the title. The probe's PowerShell read decoded it with the console's OEM code page, so it
    saw `�`. Every other character matched.
  - Proof: a plain PowerShell read of `[char]0x00EB` returns `�`, and with `[Console]::OutputEncoding = UTF8` it
    returns `ë`. A probe bug, not a Stanza one; the probe now reads UTF-8.
- **Display:** 20/20 the displayed title and artist equal `data-title`/`data-artist`.
- **Artwork:** 20/20 loaded (decoded, non-zero size) and changed from the previous track; 20/20 had a palette
  extracted.
- **Status and position:** 20/20 playing, with the time at 0:01 after each skip (position reset, interpolation
  running).
- Spotify was playing when the run started and was left playing, 20 tracks further on. Track names are not recorded
  here.
- **Still not verified:**
  - The paused CPU baseline (it needs playback paused; your OK covered skipping only).
  - The Microsoft Store build of Spotify.
  - 125%/150% scaling.
  - macOS.
  - R2's drift check (5 minutes of progress against Spotify).

## 2026-10-17 — M1 R2: not-running state, keyboard seek, drift measured, a track-change glitch fixed
**Your two calls (asked first, since both touch the contract's edges):** seek from the **keyboard only**, and show **a
message** when Spotify isn't running.
- **Not running:** no GSMTC session → `data-status="unavailable"` with no track (`NOT_RUNNING` in
  `src/adapters/spotifyFeed.ts`). The player renders `.mp-empty` with COPY.md's "Spotify not running" (new
  `COPY_LABELS.notRunning`). It shows `[NEEDS COPY]` until you write that line; I wrote none.
  - **Contract:** THEME_CONTRACT.md's per-state table and `.mp-empty` bullet now say `unavailable` with no track
    renders `.mp-empty`. It used to be "only the badge".
  - **No version bump:** no part, attribute or variable name changed, and themes already style `.mp-empty`. A theme
    can tell the two states apart by `data-status`.
  - **New fixture:** "Spotify not running (unavailable, no track)". It has no text of its own, and the whole matrix
    (5 themes × 2 engines: AA contrast, window fit, grid placement, review captures) now covers the state.
- **Keyboard seek:** `src/player/seekKeys.ts`. While the window has focus, ←/→ seek 5 s from the *interpolated*
  position, clamped to the track.
  - **When it doesn't seek:** with a modifier key; in a field that uses arrows itself (the volume slider, text
    fields); without `data-cap-seek`; with no track playing or paused.
  - **Holding a key:** repeats at most every 150 ms.
  - **Optimistic:** `PlayerStore.seek` shows the target at once, so quick presses build on each other before
    Spotify confirms; Spotify's next report replaces it.
  - THEME_CONTRACT.md's "Not in v1" seek bullet says this is app behaviour, not a part. `.mp-progress` stays
    non-interactive (T1's ring surrounds the artwork, where no control may go).
- **Automated:**
  - **Vitest:** 146 passed (6 new): the `seekTargetForKey` rules, optimistic and clamped `PlayerStore.seek`,
    `NOT_RUNNING`.
  - **`cargo test`:** 12 passed (1 new: `awaits_media`).
  - **`npx playwright test`:** 650 passed (both engines). New in `e2e/production.spec.ts`: not running at launch
    shows `[NEEDS COPY]` + badge and no track parts; Spotify closing → unavailable, reopening → the track; ←/→ send
    `spotify_seek` with 47 000 → 52 000 → 47 000 and the time shows 0:47 before Spotify confirms; clamps at 0 and at
    the end, and seeks from the interpolated position while playing; no seek with Ctrl/Alt, in a range input,
    without the cap, or when unavailable.
  - **Mutation-checked:** removing the optimistic update, the field guard and the not-running message failed exactly
    the four matching tests; restored.
- **Real exe, with your OK for seek, pause/resume and quit/reopen** (driven over CDP; Stanza's own buttons and keys,
  except two direct `spotify_seek` calls to reach a track end):
  - **Seek:** → landed **102 ms** from its target and ← (to 0) within **104 ms**.
    - A second → aimed 4 s before the end put Spotify on the next track.
    - It reproduced twice more: any seek within ~6 s of the end jumps to the next track. **That's Spotify's own
      behaviour**, likely crossfade/automix (not checked in your settings).
  - **Pause/resume via Stanza:** both took effect in ~75 ms, and the shown position jumped only 273 ms across the
    resume.
  - **The resume guard is not needed for Spotify:** it refreshes `LastUpdatedTime` while paused (about every few
    seconds) and on resume. The guard stays, as harmless insurance for other apps (any-app mode).
  - **Drift gate (passed):** Spotify re-reports its position about every **4.5 s** while playing; each report is the
    truth. Over **5 minutes untouched** (68 reports, 3 natural track changes):
    - Stanza's prediction error just before each report: median **0 ms**, 95th percentile **1 ms**, max
      **198 ms**.
    - On screen: median 188 ms, max 237 ms, which is the 250 ms tick.
    - A first 5-minute run reported a 146 s "max". That was my probe keying tracks by title/artist *lengths*, so
      consecutive tracks with equal lengths looked like one. Adding the duration removed it, and the re-run above is
      the result.
  - **Quit/reopen gate (passed):**
    - Quitting Spotify (a close request was enough): playing → idle → **unavailable** within 0.8 s.
    - Starting it again: ~11 s later, once Spotify registered with Windows, Stanza **recovered by itself** to the
      same track, paused. I resumed it with Stanza's play button (116 ms), since it had been playing.
- **Surprise, fixed: a track-change glitch.**
  - **Found:** traced at a track change, Spotify sends the *new* track's timeline (position 0, new duration) **~200 ms
    before** its title and artwork. So for ~200 ms Stanza showed the old title and artwork at 0:00 with the new
    track's length.
  - **Fix (`awaits_media`, `MEDIA_WAIT` = 400 ms in `src-tauri/src/spotify`):** a burst whose duration changed
    without a media change waits up to 400 ms for the media, then publishes once. Seeks and pauses keep the duration
    and are never held.
  - **Re-traced on 2 real track changes:** zero mixed events. Title, artwork, position and duration now arrive in one
    event.
  - **Known gap:** a new track with *exactly* the previous track's duration isn't detected, and would still show the
    ~200 ms glitch.
- **Surprise, NOT fixed (needs your call): CPU of endless animations.** All measured in the real exe, total for the
  app plus its WebView2 processes:
  - **The paused play-icon pulse:** paused with the pulse running cost **2,125 ms per 10 s (~20% of a core)**.
    Paused with the pulse switched off (over CDP, through the CSSOM) cost **0 ms**. The pulse is `mp-icon-idle` from
    `structure.css`, so **every theme** pays it whenever playback is paused, and a mini player is often left paused.
  - **Other animations, while playing:**

    | Animation | CPU per 10 s |
    |---|---|
    | None (T1) | 170–480 ms (noisy) |
    | A tiny smooth endless transform | ~1,190 ms |
    | The same, stepped once a second | ~520 ms (≈ none) |

  - **Conclusion:** in this transparent window, smooth endless animation is expensive and stepped animation is
    nearly free.
  - **Same class, not yet measured:** T4's marquee, T5's reels, the beat-driven effects.
  - PLAN.md's companion section now says movement is stepped (pixel-art style), and the risk register has both
    rows.
  - **Options for the pulse:** pulse a few times after pausing and then rest; step it at a low rate; or drop it.
- **Also seen:** a diagnostic `<style>` tag I injected was blocked by the CSP (`style-src 'self'`). More evidence the
  shipped policy is enforced.
- **Result (ran):** `npx tsc --noEmit` clean; `npx vitest run` 146 passed; `cargo test` 12 passed; `cargo clippy
  --all-targets` 0 warnings; `cargo fmt --check` clean; `npx playwright test` 650 passed (run before the Rust-only
  media-wait fix; no TS changed after it); `npm run tauri build -- --no-bundle` OK with 0 warnings, including
  `check-fixtures-excluded: OK`.
- **Not verified:**
  - The paused-CPU baseline with the pulse *fixed* (it isn't fixed).
  - Keyboard seek with a real keyboard: keys came over CDP, and real OS focus behaviour wasn't checked.
  - The 250 ms vs 1 s position tick: the playing CPU was low enough not to need it.
  - The Store build of Spotify.
  - 125%/150% scaling.
  - macOS.
