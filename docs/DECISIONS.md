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
