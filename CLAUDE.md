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
