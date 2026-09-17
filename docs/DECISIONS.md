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
