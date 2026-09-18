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
