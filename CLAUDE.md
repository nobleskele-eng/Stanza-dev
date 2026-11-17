# Project rules

## Direction (2026-11-16, docs/PLAN.md D20–D25)
- Stanza is pets first: the pet is the product, the player is its home.
- The theme system and the effects layer are retired. No new work on themes,
  user themes, variants, the customizer, snippets or effects; P1 removes them
  (PLAN.md §5). Theme T1 is a temporary face until the home (P3). The last
  commit with the theme system is tagged `themes-final`.

## Stack
- Tauri v2 ONLY. Reject v1 patterns on sight: "allowlist", a top-level "tauri" key
  in tauri.conf.json, get_window(), window-vibrancy 0.4. Permissions live in
  src-tauri/capabilities/.
- Frontend: React + TypeScript + Vite. Plain CSS + custom properties. NO Tailwind.

## Contracts
- docs/COMPANION.md is the source of truth for the pet's skin format. A format
  change bumps `format` and updates the doc in the same change.
- docs/THEME_CONTRACT.md is still the source of truth for class names, data
  attributes and CSS variables, but it is being retired (P1c replaces it with
  docs/HOME.md). Until then keep it true to the code: a change that removes a
  part, attribute or variable removes it from the doc in the same change. Add
  nothing to it, rename nothing, and leave its version at 12.
- One playback source active at a time. Never build a mixed queue.

## Content
- Never generate displayed text. UI strings come from docs/COPY.md; missing
  strings render as "[NEEDS COPY]".
- Fixtures live only in /dev/fixtures, are obviously synthetic, and must be
  excluded from production builds.
- Styling/layout tasks never change copy, names or data.
- Artwork: cropping (border-radius/clip-path), filter (blur/duotone), and
  animation are theme-authorable (D10 relaxed 2026-09-22, DECISIONS.md). Still
  locked: opacity, transform, mask, mix-blend-mode. Interactive controls may
  never sit on/over the artwork's bounding box (enforced by e2e/contract.spec.ts).
  Default radius 4px, theme-overridable.

## Quality bar (PLAN.md §0; applies to everything new)
- Nothing pretends: every movement on screen is caused by real state (playback,
  measured loudness, the listening log, the pointer). No simulated beat, no
  decoration that only looks reactive.
- One visual language: everything that isn't album art or text sits on the pet's
  pixel grid in a small palette. No gradients, glows, glass, blur or soft shadows.
- Depth over options: no menus of effects, no setting the pet doesn't need.
- No first drafts ship: ask for the owner's references before designing a look,
  show options on a sheet, build only what the owner picks.
- No chores: the pet is never hungry, guilty or in need of upkeep.

## Process
- Before coding: list files to touch, the acceptance check, the verification
  command.
- After coding: report which checks you actually ran, with output. Never say
  "works" or "done" for anything you didn't run. Visual work = "ready for review".
- Same failure twice: stop and write a diagnosis before retrying.
- Only a Windows machine is available. Mark macOS code "untested" until
  verified on a real Mac.
- Log every surprise or doc conflict in docs/DECISIONS.md.
