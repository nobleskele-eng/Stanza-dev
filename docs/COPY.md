# Stanza — Copy Inventory

All user-visible strings live here. Code reads from this file (or a generated
constant derived from it) rather than embedding copy inline. Missing entries must
render as literal `[NEEDS COPY]` in the UI, never a generated placeholder.

See `docs/PLAN.md` Section 4, "Copy inventory" for the authoritative list this
file tracks.

## App identity
- **Name:** Stanza
- **Tagline:** [NEEDS COPY] — draft: "a themeable desktop mini player… built typography-first"

## States
- **Idle / nothing playing:** [NEEDS COPY]
- **Spotify not running:** [NEEDS COPY]
- **SoundCloud — no link set:** [NEEDS COPY]
- **SoundCloud — invalid link:** [NEEDS COPY]
- **SoundCloud — track unavailable:** [NEEDS COPY]
- **macOS automation permission denied (+ how to fix):** [NEEDS COPY]
- **Theme failed to load (system error detail appended):** [NEEDS COPY]

## Settings / chrome
- **Settings labels:** [NEEDS COPY]
- **Tray menu items:** [NEEDS COPY]
- **Source badge wording:** [NEEDS COPY] — must satisfy each service's attribution
  requirements (see PLAN.md C3, C13).
- **Customizer labels:** [NEEDS COPY]
- **Contrast warning:** [NEEDS COPY]
- **Variant import error:** [NEEDS COPY]
- **Snippet import error:** [NEEDS COPY]
- **Theme package import error:** [NEEDS COPY]
- **"Reset appearance" tray item:** [NEEDS COPY]

## Player UI
- **Generic error (no detail available):** [NEEDS COPY]
- **Previous button label:** [NEEDS COPY]
- **Play button label:** [NEEDS COPY]
- **Pause button label:** [NEEDS COPY]
- **Next button label:** [NEEDS COPY]
- **Volume slider label:** [NEEDS COPY]
- **Link-out label:** [NEEDS COPY]

## Rules
- Never generate displayed text procedurally at runtime.
- Styling/layout changes must never edit this file's content.
- SoundCloud copy must credit the uploader and SoundCloud as source, per C13.
