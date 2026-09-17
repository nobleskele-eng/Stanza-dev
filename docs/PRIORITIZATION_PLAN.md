# Reprioritize: 4 features before resuming the phased plan

## Context

`main` is still the bare Tauri scaffold; the real work lives on two unmerged
throwaway spike branches (`spike/s1-window`, `spike/s2-gsmtc`) per
[PLAN.md](../../../spotify%20miniplayer/docs/PLAN.md) §5's "spikes stay on
throwaway branches" rule. Before continuing with the phase order in
`PLAN.md` (merge spikes → Phase 2 Core → Phase 3 Design system…), the user
wants four specific functions pulled forward: **volume, skip, lyrics button,
genre-based fonts**. Two side features were also raised — **custom window
dimensions** and a **Valorant overlay bypass**. The user withdrew the
Valorant item after being told it would require hooking Vanguard-protected
game rendering (kernel-level anti-cheat evasion), so it is dropped entirely
and not part of this plan.

None of these four are drop-in — each interacts with a capability gap or an
explicit "not v1" line already logged in `PLAN.md`:

- **Skip** (next/prev) already works — `spike/s2-gsmtc`'s `gsmtc_next` /
  `gsmtc_previous` commands control real Spotify today (S2 gate passed,
  [DECISIONS.md](../../../spotify%20miniplayer/docs/DECISIONS.md) 2026-09-16).
  Nothing new to build here beyond merging the spike; listed for completeness.
- **Volume** — PLAN.md's capability matrix marks Spotify·Windows volume as
  `✗ GSMTC has none`. Confirmed by the user's own question: yes, it's still
  achievable, just not through GSMTC — Windows exposes a **per-application
  volume mixer** (Core Audio `IAudioSessionManager2` / `ISimpleAudioVolume`),
  the same mechanism as the OS volume-mixer sliders, addressable by process
  name independent of master volume. SoundCloud already has real volume via
  the widget; no change needed there.
- **Lyrics button** — user chose "bring Spotify's own window to the
  foreground" (no Genius integration, no scraping, no API key). This means
  Win32 window activation targeting Spotify's process/window, which Spotify
  itself renders its lyrics panel in.
- **Genre-based fonts** — GSMTC and the SoundCloud widget expose no genre
  field at all. User chose to reopen D7 narrowly: add a **scoped Spotify Web
  API call for genre only** (artist genres via client-credentials or the
  user's own app registration), accepting the 5-user/Premium constraints
  PLAN.md already documents. This is new external-API surface the current
  architecture doesn't have.
- **Custom dimensions** — user's phrasing ("doesn't have to just be a
  resizable box") points at non-rectangular window shapes, beyond Phase 4's
  planned "per-theme window resize." Needs its own spike since Tauri window
  shaping on Windows (transparent + click-through outside an arbitrary
  silhouette) is unverified territory, same category as the S1/S6 risk
  spikes.

Given how much of this is unverified (three of four items need a new native
API surface never touched by the existing spikes), this plan adds these as
**new numbered spikes appended to Phase 1** in PLAN.md, run the same
throwaway-branch way as S1–S4, rather than skipping straight to
implementation. This matches the project's own stated process (PLAN.md §5,
§7): prove the risky assumption on a branch, log the result in
`DECISIONS.md`, only then build for real.

## New spikes (Phase 1 extension)

Each gets its own throwaway branch off `main`, same convention as
`spike/s1-window` / `spike/s2-gsmtc`.

### S5 — Per-app volume (Windows Core Audio)
- **Files:** new `src-tauri/src/volume.rs`; `Cargo.toml` gains
  `windows` crate features `Win32_Media_Audio`, `Win32_System_Com`,
  `Win32_Media_Audio_Endpoints` (enumerate audio sessions via
  `IMMDeviceEnumerator` → `IAudioSessionManager2` → `IAudioSessionControl2`,
  match by process id/name for `Spotify.exe`); new commands
  `volume_get_spotify`, `volume_set_spotify` registered in `lib.rs`.
- **Acceptance check:** a slider in the spike UI moves Spotify's level in
  the real Windows volume mixer (SndVol) independent of master volume, and
  reading it back after an external change (moving the OS mixer slider
  directly) reflects the new value.
- **Verification:** manual in `tauri dev` — set volume from the app, confirm
  in `SndVol.exe`; set from `SndVol.exe`, confirm the app reads it back.
- **Note:** `IAudioSessionControl2::GetProcessId` requires COM apartment
  init (`CoInitializeEx`) on the calling thread — same class of trap as
  S2's `RoInitialize`; watch for it.

### S6 — Bring Spotify to foreground (lyrics button)
- **Files:** new `src-tauri/src/foreground.rs`; `Cargo.toml` gains
  `Win32_UI_WindowsAndMessaging`, `Win32_Foundation`; one command
  `focus_spotify_window` (find Spotify's main window via
  `FindWindowW`/`EnumWindows` matching class name `SpotifyMainWindow`, then
  `SetForegroundWindow` — note Windows restricts `SetForegroundWindow` from
  background processes; may need `AllowSetForegroundWindow` or the
  attach-thread-input trick, confirm which actually works before committing
  to an approach).
- **Acceptance check:** clicking the lyrics button in the mini player
  restores/focuses the real Spotify window on top of whatever else is
  focused, reliably, not just the first time.
- **Verification:** manual — trigger from `tauri dev` while Spotify is
  minimized/behind other windows.

### S7 — Scoped Spotify Web API call for genre
- **Files:** new `src-tauri/src/spotify_web.rs`; `Cargo.toml` gains an HTTP
  client (`reqwest` with `json` feature) since nothing in the current deps
  can make external HTTPS calls; new command `fetch_artist_genres(artist_id
  | artist_name)` using client-credentials OAuth (`/api/token`) then
  `GET /v1/artists/{id}` or search-by-name fallback; cache genre-by-artist
  in memory (and later persist) to respect the 5-user/rate-limit cap noted
  in PLAN.md C1.
- **Requires from the user before this spike starts:** a registered Spotify
  app (Client ID + Secret) in their own Spotify developer dashboard — this
  plan does not create Spotify credentials on the user's behalf.
- **Acceptance check:** given a track's artist name/id from the existing
  GSMTC snapshot, the spike returns a genre string within a couple hundred
  ms (cached) and doesn't hit `QUOTA_EXCEEDED` under normal use.
- **Verification:** manual — log the genre for 20 track changes across
  different artists, confirm no request errors.
- **Design follow-on (not in this spike):** a genre→font mapping table
  becomes a new theme-contract concern — likely a new app-provided variable
  like `--mp-font-genre` or a `data-genre` attribute on `.mp-root`, decided
  in Phase 3 alongside the rest of `THEME_CONTRACT.md` v1, not invented here.

### S8 — Non-rectangular custom window shape
- **Files:** experiment only, on the `spike/s1-window` lineage — no new
  module; test whether a transparent Tauri window can have mouse
  click-through outside an arbitrary silhouette (CSS `clip-path` alone does
  not affect hit-testing; likely needs a Win32 region via
  `SetWindowRgn`/`DwmExtendFrameIntoClientArea`, an unverified area like C6).
- **Acceptance check:** a non-rectangular pill/blob shape renders with no
  visible rectangular hit-box — clicks outside the visible silhouette pass
  through to whatever's behind the window.
- **Verification:** manual in `tauri dev` and the bundled build (transparency
  already showed a dev-vs-bundle gap once, per C6 — check both).
- **Note:** if this fails, the fallback is "resizable box only," which is
  still a real feature (Phase 4 already planned per-theme window resize) —
  this spike only decides whether *shape* freedom is added on top of that.

## Docs to update in the same change as each spike lands

- `docs/PLAN.md` — capability matrix: flip Spotify·Windows volume from `✗`
  to `✓ (Core Audio, per-app)` with a footnote it's OS-level, not GSMTC;
  add S5–S8 to §5 Phase 1; add the lyrics-button and genre-font decisions
  to §1 Decision log (new D-numbers) since both reopen prior exclusions
  (Lyrics was in the §8 parking lot; genre reopens D7).
- `docs/DECISIONS.md` — one entry per spike, same format as the existing
  2026-09-16 entries, including the gate result.
- `docs/COPY.md` — new copy slots: lyrics-button label/tooltip, any
  genre-unavailable fallback string, volume-unavailable fallback (SoundCloud
  vs Spotify differ in what's controllable).
- `docs/THEME_CONTRACT.md` — not touched until Phase 3 per its own stub
  note, but flag the future `data-genre`/`--mp-font-genre` addition in its
  TODO list now so it isn't lost.

## Verification (overall)

- Each spike gated individually as described above, on its own branch,
  before merging — same discipline as S1/S2.
- `cargo check` after each new module addition (native Rust, no test
  harness yet at this stage per PLAN.md Phase 2).
- No spike merges to `main` until its gate passes and `DECISIONS.md` is
  updated, matching the project's existing rule.
