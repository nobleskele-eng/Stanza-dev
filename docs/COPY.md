# Stanza — Copy Inventory

All user-visible strings live here. Code reads from this file (or a generated
constant derived from it) rather than embedding copy inline. Missing entries must
render as literal `[NEEDS COPY]` in the UI, never a generated placeholder.

See `docs/PLAN.md` Section 4, "Copy inventory" for the authoritative list this
file tracks.

## App identity
- **Name:** Stanza
- **Tagline:** [NEEDS COPY] — draft: "a themeable desktop mini player… built typography-first"

## Theme names (first-party)
Placeholders, not approved copy: you said "name the themes anything for now" (2026-09-27), so these are
the working names PLAN.md's roster and DECISIONS.md already used. Replace them freely. Each theme's
`theme.json` `name` must match its entry (checked by `src/theme/registry.test.ts`); the theme picker
shows `name`.
- **Theme name — t1-default:** Default
- **Theme name — t2-artwork:** Glow Card
- **Theme name — t3-pill:** Micro Pill
- **Theme name — t4-extreme:** Extreme
- **Theme name — t5-kinetic:** Kinetic

## States
- **Idle / nothing playing:** idle
- **Spotify not running:** [NEEDS COPY]
- **SoundCloud — no link set:** [NEEDS COPY]
- **SoundCloud — invalid link:** [NEEDS COPY]
- **SoundCloud — track unavailable:** [NEEDS COPY]
- **macOS automation permission denied (+ how to fix):** [NEEDS COPY]
- **Theme failed to load (system error detail appended):** [NEEDS COPY]

## Settings / chrome
- **Settings labels:** [NEEDS COPY]
- **Tray menu items:** [NEEDS COPY]
- **Source badge wording:** Spotify
  — must satisfy each service's attribution requirements (see PLAN.md C3, C13).
- **Customizer labels:** [NEEDS COPY]
- **Effects section title:** [NEEDS COPY]
- **Effect label — shapes:** [NEEDS COPY]
- **Effect label — waveform:** [NEEDS COPY]
- **Effect label — title text effect:** [NEEDS COPY]
- **Effect label — artist text effect:** [NEEDS COPY]
- **Effect option — typewriter:** [NEEDS COPY]
- **Effect option — ripple:** [NEEDS COPY]
- **Effect option — liquid:** [NEEDS COPY]
- **Effect option — split-flap:** [NEEDS COPY]
- **Effect label — flow backdrop:** [NEEDS COPY]
- **Effect label — track-change morph:** [NEEDS COPY]
- **Effect label — title debris:** [NEEDS COPY]
- **Effect option — off:** [NEEDS COPY]
- **Effects note (beat is simulated, not audio):** [NEEDS COPY] — must not imply the effects react to the music (PLAN.md D16).
- **Contrast warning:** [NEEDS COPY]
- **Variant import error:** [NEEDS COPY]
- **Snippet import error:** [NEEDS COPY]
- **Theme package import error:** [NEEDS COPY]
- **"Reset appearance" tray item:** [NEEDS COPY]

## Companion (PLAN.md §4b, planned for M2)
Nothing reads these yet. More entries (one per skin and per palette) get added when those skins exist. The companion has
no speech bubbles; its emotes are pixel icons, not text.
- **Companion skin name — pilcrow:** [NEEDS COPY]
- **Companion skin name — bookworm:** [NEEDS COPY]
- **Companion skin name — cassette:** [NEEDS COPY]
- **Companion menu — submenu label:** [NEEDS COPY]
- **Companion menu — show/hide item:** [NEEDS COPY]
- **Companion menu — skins heading:** [NEEDS COPY]
- **Companion menu — palettes heading:** [NEEDS COPY]
- **Companion settings — section title:** [NEEDS COPY]

## Player UI
- **Generic error (no detail available):** error — message @stayvyxed on Discord
- **Previous button label:** Previous
- **Play button label:** Play
- **Pause button label:** Pause
- **Next button label:** Next
- **Volume slider label:** Volume
- **Lyrics button label:** Lyrics
  — the button brings Spotify's own window forward (where its lyrics are); it doesn't show lyrics itself
- **Link-out label:** Open

## Rules
- Never generate displayed text procedurally at runtime.
- Styling/layout changes must never edit this file's content.
- SoundCloud copy must credit the uploader and SoundCloud as source, per C13.
