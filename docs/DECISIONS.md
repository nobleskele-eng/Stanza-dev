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
