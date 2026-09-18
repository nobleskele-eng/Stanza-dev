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
