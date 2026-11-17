# Stanza — Master Plan

**Stanza** — a small pixel creature that lives on your music. The mini player is its room (*stanza* is Italian for "room").
*Working description, yours to rewrite (COPY.md's tagline is still `[NEEDS COPY]`):* a desktop pet for Windows that lives on a Spotify mini player, built with Tauri.

Version 3 · 2026-11-16, amended 2026-11-17 (D26–D28: artist pets, leaving the player, unlocks) · Status: **pets first** (D20–D25; your call, 2026-11-16: "ditch themes").
- **Built and staying:** real Spotify music on Windows (M1); the pet, with three species, five palettes each and four accessories, travelling the card's outline, clickable, picked up and dropped (M2); the window (frameless, transparent, click-through); the settings window's shell (M3 L4a).
- **Built and being retired:** the theme system (five themes, the picker, user themes, live reload, variants; theme contract v12) and the effects layer. The last commit with them is tagged `themes-final`.
- **Next:** P1, clearing the ground (§5). Then the home (§4c) and what the pet does with your music (§4d).

Version 2 (2026-10-17, "real music, then a companion") and version 1 (2026-09-11) are in git history.

Section numbers §0–§11 are the same as in v1 and v2, because code comments and older `docs/DECISIONS.md` entries cite them. §4 now records the retired theme system and what survives it. The pet is §4b. The home, what the pet does with your music, and user-made pets are the new §4c–§4e. §5 holds the status and the steps P0–P6, with v2's milestones as history.

---

## 0. Scope interpretation

- **The pet is the product (D20).** Stanza is a desktop pet whose home is a Spotify mini player. Every feature is judged by what it adds to the pet. The player's job is to be a good room and a correct remote control. There is no theme system.
- "Web-based design only" = every pixel of UI is HTML/CSS/SVG rendered in the Tauri webview. No raster assets from Nano Banana Pro. App icon, control icons, the home's art and the pet's sprites are SVG/CSS. The pet's pixel art is data (palette grids) rendered as SVG, not image files (§4b); a sprite sheet imported for a user-made pet (§4e) is converted to that data.
- Displayed information comes only from the music services (track metadata, artwork) or from copy you write. Nothing generated. The pet has no speech: its emotes are pixel icons.
- Platforms: Windows first (your machine), macOS second and gated on real-Mac testing.
- Sources: **v1 ships Spotify-only** (D15). SoundCloud remains the long-term second source but is deferred to a post-v1 expansion phase, grouped with Windows any-app mode — see §5 "Post-v1" and §10 open questions #5–6. Apple Music stays dropped.

### The bar (what "not slop" means here)
Your words for the goal: "unique, fun, interesting, cool and NOT vibe code slop". These rules are how a change is judged against it. `CLAUDE.md` carries them.
1. **Nothing pretends.** Every movement on screen is caused by real state: playback, the measured loudness of the music, your listening log, your pointer. No simulated beat, no decoration that only looks reactive (D21).
2. **One visual language.** Everything that isn't album art or text sits on the pet's pixel grid in a small palette. No gradients, glows, glass, blur or soft shadows (D22).
3. **Depth over options.** One home, one idea, taken far. No menus of effects, no setting the pet doesn't need.
4. **No first drafts ship.** A look goes from your references, to a sheet of options, to your pick.
5. **No chores.** The pet is never hungry, guilty or in need of upkeep (D24).

---

## 1. Decision log

| # | Decision | Status | Reason |
|---|---|---|---|
| D1 | Tauri v2 (Rust core + web frontend) | Confirmed | Design-controllable frontend, small native shell |
| D2 | No Spicetify / DOM injection | Confirmed | Inherited markup, breaks on Spotify updates |
| D3 | No macOS MediaRemote | Confirmed, stronger | macOS 15.4+ blocks unentitled clients (see C4) |
| D4 | Spotify on macOS via AppleScript | Confirmed | Still works in 2026; needs Info.plist key + entitlement (C5) |
| D5 | Spotify on Windows via GSMTC, filtered to Spotify's session | **New / changes earlier framing** | The earlier plan had no Windows path. Windows has no Spotify-specific local API (AppleScript is macOS-only). GSMTC is the public, documented Windows API — the reason the "universal OS route" was rejected was macOS, not Windows. Per-platform adapters keep the per-service spirit. |
| D6 | SoundCloud via Widget API | Confirmed, with a note | The widget *plays audio inside your app*. Spotify mode is a remote; SoundCloud mode is a host. Architecture must handle both. |
| D7 | Spotify Web API | **New: excluded from v1** | 5-user dev cap, Premium-owner requirement, endpoint removals (C1). Not needed for now-playing + transport. Revisit only for a "save to library" button. **Narrow exception planned:** S7 genre lookup (M3, §5), which you chose to allow. |
| D8 | Spotify Web Playback SDK | **New: rejected** | Needs Widevine DRM; license failures are common in desktop/embedded webviews |
| D9 | One playback source active at a time | **New constraint** | SoundCloud API Terms prohibit playback experiences that combine SoundCloud content with other services (C13) |
| D10 | Artwork's crop/filter/animation are theme-authorable; controls may never sit on top of it | **Relaxed 2026-09-22** | Originally driven by Spotify's Design Guidelines (C3) and SoundCloud's terms (C13); relaxed for this project deliberately, not a compliance claim — see amendment below and DECISIONS.md |
| D11 | No native blur/Mica/Acrylic in default themes | **New** | Your Win10 machine: Mica is Win11-only, Acrylic lags while dragging (C9). A mini player gets dragged constantly. |
| D12 | Frontend: React + TypeScript + Vite, plain CSS with custom properties, **no Tailwind** | **New** | User themes need stable semantic hooks. Utility-class soup makes a theme contract impossible. React chosen over Svelte for your and Claude Code's familiarity; bundle size is dominated by the native shell anyway. |
| D13 | Windows-first; macOS merged only after testing on a real Mac | **New** | You can't meaningfully build or test macOS from Windows. CI can compile it, but AppleScript permissions and window transparency only verify on a Mac. |
| D14 | Customization = three layers: (a) in-app customizer editing theme tokens, saved as variants; (b) user CSS snippets layered on top of the active theme; (c) importable theme packages | **Superseded by D20 and D23 (2026-11-16)** | Customization is the core purpose of the project. It still is: it moves to the pet (D23). |
| D15 | v1 ships Spotify-only on Windows; SoundCloud support and Windows any-app mode are grouped into a post-v1 expansion phase, order TBD | Confirmed | You want v1 launched with Spotify first rather than carrying SoundCloud's spike/API-terms risk (D6, D9, C13) into the critical path. |
| D16 | Opt-in animated effects (shapes, waveform, typewriter/ripple/liquid/split-flap text, flow backdrop, track-change morph, physics debris) — the audio-looking ones driven by a **simulated** beat; icon click/idle motion on by default | **Superseded by D21 (2026-11-16)**; was new 2026-09-23 | Wanted for the design showcase. Built as an app-provided layer (`src/fx/`, anime.js MIT + SVG filters), switched on per user via variants, not baked into themes. The beat is a seeded fake — nothing analyses the audio (no clean audio source, §9) — so no UI or doc may claim it reacts to the music. Contract v4, extended in v5 by design round 2 (theme T5). See `docs/DECISIONS.md` 2026-09-23. |
| D17 | **Companion:** an opt-in, app-provided pixel-art creature on and around the player. One window grown by a margin; pixel grids rendered as SVG; a seeded state machine; interactive (click, pick up and drop), but never over the artwork, controls or source badge, and never outside the window | **Built (M2).** On by default from P1b (D25). Leaving the window: D27 | You asked for a pet like the one on Claude's chat box that can walk, sit and hang inside and outside the frame, with skins and original designs. Pixel art, "watch + pick up", around the player only: your choices. Spec and architecture in §4b. |
| D18 | Order: real Spotify data on `main` (M1) before the companion (M2) | **New 2026-10-17** | The GSMTC spike passed on 2026-09-16 but never reached `main`, so the app only shows idle. The companion reacts to play/pause/track change, which only means something with real data. Your choice. |
| D19 | PLAN.md is the single plan again; `docs/PRIORITIZATION_PLAN.md` (spikes S5–S8) folded into §5 and deleted | **New 2026-10-17** | Two plans competed. S5 (per-app volume) and S6 (lyrics button → focus Spotify) → M1; S7 (genre fonts) → M3; S8 (window shapes): rectangles were answered by Slice 3's click-through, arbitrary silhouettes parked (§9). |
| D20 | **Pets first; the theme system is retired.** No theme roster, picker, user themes, live reload, variants, customizer, snippets or theme packages. One player, designed as the pet's home (D22) | **New 2026-11-16, your call** ("ditch themes") | The five themes were built to prove the theme contract (v2 §4: each "stress-tests a different part of the contract"), so none of them is about anything; your words: "too claude generated, vibe coded looking plus they lack substance". The contract's generality also kept the pet to a box: four edges and one shelf. Supersedes D14. M3's L4b, L5, L6 and S7 are dropped. The last themed commit is tagged `themes-final`. See §4. |
| D21 | **Nothing pretends.** The effects layer (D16) and its simulated beat are removed. The pet reacts to real state only: playback, the measured loudness of Spotify's output, your listening log, your pointer | **New 2026-11-16.** The loudness reading is a default taken (not explicitly answered); re-asked at P2a | An effect that looks reactive but isn't is what the pivot is getting away from. Loudness comes from the peak meter of Spotify's own audio session, the one `volume.rs` already finds: a level, not audio; nothing is captured or stored. Unverified until the P2a spike (§4d). Supersedes D16. |
| D22 | **One home.** Pixel art on the pet's own grid, compact, chosen in a design round that starts from references you bring. Internal: no public contract. D10 and the source-badge rule apply to it unchanged | **New 2026-11-16** | One visual language instead of five skins. Compact because a visible change costs less in a small window (C0: 3.1 ms at 312×150 against 5.9 ms at 404×664), and that cost is the pet's activity budget. A second home, if ever wanted, is another bundled home, not an API. See §4c. |
| D23 | **Customization moves to the pet.** Species, palettes and accessories (built), then user-made pets: a folder, validated, live-reloaded, with an importer for sprites drawn in a pixel editor | **New 2026-11-16** | Customization is still the purpose (D14's reason). The validate-and-watch pattern built for user themes (M3 L2/L3) is reused. See §4e. |
| D24 | **Listening memory, local only, and no chores.** A log of plays, skips and repeats on this PC, so the pet's reactions mean something. It is never hungry, guilty or in need of upkeep | **New 2026-11-16, default taken** (not explicitly answered); re-asked at P4 | Today every track change gets the same reaction. The log never leaves the machine. See §4d. |
| D25 | **The pet is on by default** (it was opt-in, D17). The on/off switch stays | **New 2026-11-16, default taken** (not explicitly answered); re-asked at P1b | It is the product. |
| D26 | **Artist pets are user-made pets.** A pet of an artist you listen to is made outside Stanza (by hand or with a sprite tool) and imported (§4e). It can name its artist and comes out when Spotify plays them. Stanza has no AI generation in it, and never bundles, demos or ships a real person's likeness; a user's pet is its author's | **New 2026-11-17, your call** | Your idea (a Playboi Carti pet walking round the player). The sprite tools make about 4 of the 11 required poses and run online with paid keys; Stanza is offline. The artist link is what ties it to real playback (§0). See §4e. |
| D27 | **The pet may leave the player** and roam the desktop. Gated on a spike (P2c) | **New 2026-11-17, your call**; un-parks it from §9 | Your pick from Pocket Bird. It changes the M2 spec ("never leaves the player's window", §4b). It was parked because a separate pet window lags behind a dragged player, so P2c measures that first. Nothing is built until you decide on P2c's numbers. |
| D28 | **Unlocks earned by listening.** New pets or accessories come from the local listening log (B1). Never lost, never on a timer, nothing to keep up; nothing you have today gets locked | **New 2026-11-17, your call** | Your pick from Pocket Bird. D24 (no chores) holds. See §4d B4. |

**D10 amendment (2026-09-22):** relaxed from "unmodified artwork" to "cropped
(`border-radius`/`clip-path`), overlaid, or filtered (blur/duotone) artwork —
interactive controls still never sit on top of it, and the artwork itself still
never animates in a way that would need `opacity`/`transform` (both stay locked
in `src/theme/guard.css`, along with `mask`/`mix-blend-mode`). A conscious
deviation from Spotify's Design Guidelines (C3) and, by extension, the spirit of
SoundCloud's User Content terms (C13) that originally motivated D10 — C3's own
resolution note already anticipated this exact tension ("anyone reviewing your
portfolio who knows the rules will spot a blurred-artwork background") and this
amendment accepts that tradeoff deliberately for this personal/portfolio
project, not as a claim of continued guideline compliance. D9 (one source
active, never combined) and C13's attribution requirements (badge, link-out, no
SoundCloud-confusable naming) are untouched. Full rationale: `docs/DECISIONS.md`
2026-09-22.

---

## 2. Documentation conflicts found and how they resolve

Kept as written in v1 (history). Later surprises live in `docs/DECISIONS.md`.

**C1 — Spotify Development Mode limits**
- Old tutorials: 25 test users; extended quota available to apps.
- Current (Feb 2026): 5 users per app, app owner must hold Premium, several endpoint families removed (effective Feb 11 new / Mar 9 existing apps). Extended quota is organisations-only with 250k+ MAU since May 2025.
- July 23 2026: Client IDs per account raised 1 → 25; dev-mode quota now counted per account, not per Client ID; 429s now carry `QUOTA_EXCEEDED`.
- Sub-conflict: a third-party guide reviewed July 20 2026 still says one Client ID per developer. Superseded by Spotify's own July 23 post.
- **Resolution:** trust only developer.spotify.com changelog pages dated 2026 for access rules. Drives D7.

**C2 — Can you get a SoundCloud API key?**
- `github.com/soundcloud/api` README FAQ: not issuing new keys.
- Third-party guides (early 2026): apply through a form / chatbot, manual review.
- Official developer docs (2026): self-serve registration, requires an Artist Pro subscription; a CLI registration tool exists.
- **Resolution:** the official docs are current; the GitHub FAQ is stale. Irrelevant for v1 — the Widget API needs no client_id. Only matters if you later want search or likes (Artist Pro was US$99/yr per TechCrunch, Dec 2024 — re-check current price).

**C3 — Spotify artwork corner radius**
- Current design page: 4px small/medium, 8px large.
- Legacy URL (`/documentation/general/design-and-branding/`): 2px / 4px.
- **Resolution:** current page. A mini player is "small" → 4px. Also: no cropping, no overlays or text on the artwork, no controls covering it, no blur, no animation, Spotify logo attribution alongside Spotify metadata.
- Applicability: the guidelines are written for Spotify Platform integrations; you're reading from the client through OS APIs, so strict applicability is unclear. Comply anyway — it's cheap, and anyone reviewing your portfolio who knows the rules will spot a blurred-artwork background. *(Since relaxed by the D10 amendment, §1.)*

**C4 — Getting now-playing on macOS**
- Many crates/tutorials: use MediaRemote.framework.
- Since macOS 15.4 the MediaRemote daemon checks entitlements; workarounds are a bundled Perl adapter or code injection with SIP disabled.
- **Resolution:** AppleScript (D4). Don't adopt the Perl workaround — it rides on a loophole Apple can close in any update.

**C5 — AppleScript permission in a bundled app**
- Some forum answers: `NSAppleEventsUsageDescription` is an entitlement and needs a paid developer account.
- Apple DTS: it's an **Info.plist key**; free signing works; TCC tracks the grant by code signature, so an unstable signature causes confusing failures.
- Other reports: the `com.apple.security.automation.apple-events` entitlement is also required, even non-sandboxed; if either is missing there's no prompt and the script fails silently.
- **Resolution:** ship both (Info.plist key + entitlement) and sign with the same identity every build. Expect the classic trap: works under `tauri dev` (Terminal holds the permission), fails silently in the bundle. Always test the bundle.

**C6 — Tauri window transparency on macOS**
- Docs: `transparent: true` + `macOSPrivateApi: true`.
- Open report (Tauri 2.5.x): transparent in dev, solid white after DMG bundling even with the private API enabled.
- **Resolution:** transparency is unverified until a bundled build passes on a real Mac. Design rule that makes this survivable: **every theme must also look intentional as an opaque rectangle.** (`macOSPrivateApi` means App Store rejection — irrelevant, you're not shipping there.)

**C7 — Tauri v1 vs v2 snippets (the biggest Claude Code hazard)**
- v1 patterns still dominate search results: `allowlist`, the `tauri` key in `tauri.conf.json`, `get_window()`, window-vibrancy 0.4.
- v2: capabilities/permissions files, `app.macOSPrivateApi`, `get_webview_window()`, window-vibrancy's current line (0.4 is the v1 line).
- **Resolution:** hard rule in CLAUDE.md — reject any v1 pattern on sight.

**C8 — `data-tauri-drag-region`**
- Expectation: put it on the card, the whole card drags.
- Reality: only fires when the element you actually clicked has the attribute (children don't inherit); double-click toggles maximise.
- **Resolution:** custom `mousedown` handler → `startDragging()` unless the target is inside `button, input, a, [data-no-drag]`. Add the `core:window:allow-start-dragging` permission. No maximise on double-click.

**C9 — "Glass" effects on Windows**
- Tutorials recommend Acrylic/Mica for glass-style mini players.
- window-vibrancy README: Mica is Windows 11 only; Acrylic has bad performance while resizing/dragging on Win10 v1903+ and Win11 build 22000.
- **Resolution:** D11. Native effects become an optional per-theme flag, off by default, Windows 11 only.

**C10 — GSMTC playback position**
- Tutorials read `Position` directly → progress bar freezes between updates.
- Microsoft docs: position is only current as of `LastUpdatedTime`.
- **Resolution:** interpolate — `position + (now − LastUpdatedTime) × rate` while playing; resync on the timeline-changed event.

**C11 — SoundCloud Widget docs**
- Two URLs: `/docs/html5-widget` (old) and `/docs/api/html5-widget` (current). Same content; cite the `/api/` one.
- Autoplay: the iframe needs `allow="autoplay"` or Chromium won't delegate your click to the iframe, and `play()` from your own button silently fails.

**C12 — Internal conflict in our own earlier decisions**
- "Per-service APIs, not OS-level hooks" left Windows Spotify with no mechanism. Resolved by D5.

**C13 — "Universal player" vs SoundCloud API Terms**
- Terms prohibit a playback experience combining SoundCloud content with other services, app names containing SoundCloud marks, and visual design confusingly similar to SoundCloud. They require crediting the uploader, crediting SoundCloud as the source, and backlinks to the sound's soundcloud.com URL (stated for web pages; include a link-out anyway).
- Whether these terms bind Widget-only use (no registered app) is ambiguous. Not legal advice — but design compliant anyway: it costs nothing and the project is public.
- **Resolution:** D9 (source switch, never a mixed queue), required source badge, link-out, app name free of both services' marks.

---

## 3. Architecture

```
┌───────────────────────────── Tauri app ──────────────────────────────┐
│ WEBVIEW (React + TS)                                                 │
│   Player window (frameless, transparent, on top) ✓                   │
│     The home: one DOM, one layout ○ P3 (§4c)                         │
│       until then: theme T1, hard-wired by P1                         │
│     The pet ✓ M2 (§4b): brain, renderer, skins, picker               │
│       memory ○ P4 · hearing ○ P4 · perches ○ P4 (§4d)                │
│     PlayerStore ✓ (single source of truth for the UI)                │
│        ▲ IPC events                                                  │
│   Settings window ✓ shell (M3 L4a): the pet's options                │
│        │ invoke / events                                             │
│ RUST CORE                                                            │
│   ├─ SpotifyAdapter · Windows (GSMTC) ✓ M1                           │
│   ├─ Per-app volume (Core Audio) ✓ M1 R3a                            │
│   ├─ Loudness meter, same audio session: spike ○ P2a, then ○ P4      │
│   ├─ Listening log (a file in the app data dir) ○ P4                 │
│   ├─ User pets (scan, validate, watch files) ○ P5                    │
│   ├─ Hit region / click-through ✓ (Slice 3)                          │
│   ├─ SpotifyAdapter · macOS (AppleScript) ○ post-launch              │
│   └─ Shell: window state ✓ (position only), tray ○,                  │
│      autostart ○, single-instance ○ (P6)                             │
│ ✗ REMOVED BY P1                                                      │
│   theme layer and ThemeService (scan, validate, watch files),        │
│   variants, the effects layer (src/fx)                               │
└──────────────────────────────────────────────────────────────────────┘
✓ on main   ○ planned (step in §5)   ✗ on main today, removed by P1
```

One adapter is built: Spotify on Windows, in Rust. The macOS adapter (Rust) and the SoundCloud one (JS) are post-launch and post-v1. The store normalises every source into one shape. Artwork palette extraction runs in TypeScript, not in a Rust `ArtworkService` (DECISIONS.md 2026-09-22): Windows artwork reaches the webview as a `data:` URL, so the canvas is never tainted. Revisit Rust only if the macOS adapter's remote artwork URLs taint it.

### State model

```ts
type SourceId = 'spotify' | 'soundcloud';
type Status = 'idle' | 'playing' | 'paused' | 'unavailable' | 'error';

interface Capabilities {
  seek: boolean; volume: boolean; shuffle: boolean;
  repeat: boolean; album: boolean;
}

interface NowPlaying {
  source: SourceId;
  status: Status;
  track?: {
    title: string; artist: string; album?: string;
    artwork?: string;      // URL or data URL
    permalink?: string;    // link-out target
    durationMs?: number;
  };
  positionMs: number;
  positionUpdatedAt: number; // for interpolation (C10)
  caps: Capabilities;
  error?: { code: string; detail: string };
}
```

### Capability matrix (✓ known · ✗ not possible · ? unverified)

| | Spotify · Win (GSMTC) | Spotify · mac (AppleScript) | SoundCloud (Widget) |
|---|---|---|---|
| Title / artist | ✓ | ✓ | ✓ (uploader = artist) |
| Album | ✓ | ✓ | ✗ no album concept |
| Artwork | ✓ image bytes (resolution ?) | ✓ URL | ✓ URL |
| Play / pause / next / prev | ✓ | ✓ | ✓ |
| Position | ✓ interpolated | ✓ | ✓ progress events |
| Seek | ✓ (S2) | ✓ | ✓ |
| Volume | ✗ in GSMTC; ✓ Spotify's per-app level via Core Audio (S5, passed 2026-10-17) once Spotify has played since it started | ✓ | ✓ |
| Shuffle / repeat | ✓ shuffle (S2); repeat read ✓, set ? | ✓ (community libs set it) | ✗ native (shuffle emulatable) |
| Change events | ✓ | ? distributed notification, else polling | ✓ |
| Like / save | ✗ | ✗ | ✗ |

**Design consequence:** capabilities are exposed as `data-cap-*` attributes. The home must look complete when any control is absent — e.g. Spotify on Windows has no volume slider until Spotify has played since it started (no audio session to set yet, S5).

### Source rules
1. One active source. Switching pauses the other.
2. Spotify mode = remote (audio plays in Spotify). SoundCloud mode = host (audio plays in the mini player; quitting stops music; hide-to-tray must keep the webview alive).
3. SoundCloud input: paste a track / playlist / profile URL in settings. No login, no key. Persist the last URL.
4. Windows media keys: in SoundCloud mode the webview may register its own system media session. The GSMTC adapter must ignore every session that isn't Spotify's, including your own app's.
5. Spotify session identification: log the actual `SourceAppUserModelId` (it differs between the spotify.com installer and the Microsoft Store build) — don't hardcode a guessed value. S2 found `Spotify.exe` for the installer build; the Store build is unchecked.

### Artwork and colour
- Palette extraction (`src/theme/palette.ts`) yields 3 dominant colours as `--mp-art-1..3` plus a contrast-checked `--mp-art-fg` (always AA against `--mp-art-1`).
- The artwork element itself (D10, relaxed 2026-09-22): the home's CSS may crop it
  (`border-radius`/`clip-path`), overlay text/graphics on top of it, apply
  `filter` treatments (blur, duotone), and animate it. It must never sit under
  interactive controls (the companion counts as one, §4b); `opacity`/`transform`/`mask`/`mix-blend-mode` stay
  guard-locked (`src/theme/guard.css`).

---

## 4. Theme system — retired (D20)

Until 2026-11-16 this section was "the design showcase": a theme contract, five first-party themes, user themes loaded and hot-swapped at run time, variants, and a planned customizer, snippets and theme packages. D20 retires all of it, and P1 (§5) removes it. The full text is PLAN.md v2 in git history; the last commit with the system working is tagged `themes-final`.

### What it was (for reading older code and DECISIONS.md entries)
- **Contract:** `docs/THEME_CONTRACT.md`, v12 at retirement: one fixed DOM (`.mp-root`, `.mp-window`, the parts), data attributes, CSS variables and the `theme.json` fields. From P0 it only shrinks: a P1 slice that removes a part removes it from the doc in the same change, nothing is added, and the version stays 12. P1c replaces it with the home's own short parts list (`docs/HOME.md`, §4c).
- **Themes:** T1 Default ("Ring + Depth"), T2 Glow Card, T3 Micro Pill, T4 Extreme, T5 Kinetic. Each stress-tested a different part of the contract, which is why none of them was about anything. T1 stays, hard-wired, as a temporary face until the home replaces it (P3).
- **Runtime:** user themes from `<app data dir>/themes/` through the asset protocol (M3 L2), live reload (M3 L3), cascade layers `guard, base, theme, user` (M3 L1), variants in `localStorage` (Slice 1), the theme list in the right-click menu (Slice 4).
- **Effects layer (D16):** shapes, a waveform, text effects, split-flap, flow, morph and debris, the audio-looking ones on a simulated beat. Removed with it (D21).
- **Customization layers (D14):** the customizer, CSS snippets and theme packages were never built past the variant model. Dropped.

### What survives it
- **One DOM.** `src/player/Player.tsx` stays the single structure. The home styles it and may change its parts (§4c).
- **The guard.** `src/theme/guard.css` and its e2e checks: the source badge always visible, the artwork's locked properties locked (D10), nothing interactive on or over the artwork.
- **The artwork palette** (`src/theme/palette.ts`, `--mp-art-1..3`, `--mp-art-fg`) and the contrast check.
- **Fixtures and the matrix** (below), run against one layout.
- **The pattern** of validating a package in Rust and watching its folder, reused for user-made pets (§4e).

### Copy inventory — all yours to write
- App name **Stanza**. It was chosen for a typography-first player (a stanza is a unit of text). It also means "room", which is what the player now is. No Spotify/SoundCloud marks. Whether to keep it is §10 #15.
- Tagline `[NEEDS COPY]` (v2's draft described the themed player)
- Idle / nothing playing: written
- Spotify not running `[NEEDS COPY]`
- SoundCloud: no link set / invalid link / track unavailable `[NEEDS COPY]` (post-v1)
- macOS automation permission denied + how to fix `[NEEDS COPY]` (post-launch)
- Settings labels and tray menu items `[NEEDS COPY]`; source-badge wording: written, and it must meet each service's attribution rules
- The pet: species, palette and accessory names, menu labels, its settings section `[NEEDS COPY]` (§4b)
- Leaving with the theme system (P1c): theme names, the effect labels, the customizer, contrast, variant, snippet and theme-package strings, Reset appearance

Keep these in `docs/COPY.md`; code reads from there.

### Fixtures (design iteration without Tauri)
- A mock adapter lets the frontend run in a normal browser with fixture states — fastest loop for design work, and Claude Code can screenshot it with Playwright.
- Fixtures are obviously synthetic strings (carrying a `FIXTURE-ONLY` marker), stored only in `/dev/fixtures`, and stripped from production builds — verified on every build by `scripts/check-fixtures-excluded.mjs`. This is how they were built in Phase 2; §10 #2 records that the policy was never formally confirmed.
- Fixture matrix: long title, long artist, CJK/accented characters, emoji, no artwork, no album, paused, idle, error, each capability off, very light / very dark / colourful artwork.
- Playwright renders in both Chromium (≈ WebView2, Windows) and WebKit (≈ WKWebView, macOS) on your Windows machine — catches most Safari-engine CSS gaps before you ever touch a Mac. Not identical to WKWebView; still needs the real-Mac pass.

---

## 4b. The pet (D17) — built in M2

The code calls it the companion (`src/companion/`, `.mp-companion`, `companions/`). You call it the pet, and so does this plan from v3. Renaming the code is not planned.

**Everything in this section is built and stays.** It is the spec M2 was built to. The pivot changes four things:
- **On by default** (D25, with P1b). It was opt-in.
- **Its surfaces come from the home** (§4c, P3), not from a theme's `theme.json`.
- **What drives it grows** (§4d, P4). Today it is playback state only ("never to the audio" below was D16's rule). Then: the real loudness, your listening log and the layout.
- **It may leave the player** (D27, 2026-11-17), if the P2c spike passes and you decide to build it. Until then the spec below holds: it never leaves the player's window.

### What it is (your request, as a spec)

> **Stanza companion.** A small original pixel-art creature lives on the mini player. It walks along
> the top edge, sits (legs dangling), climbs down the sides, hangs from the bottom edge, and sits on
> a ledge inside the card when the theme has room. It reacts to playback: awake while playing, dozes
> when paused or nothing is playing, perks up on a track change. It reacts to playback state, never
> to the audio (D16). You can click it for a reaction, or pick it up and drop it; it falls and lands
> on the nearest edge. It never covers the artwork, the controls or the source badge, and never
> leaves the player's window. Skins: more creatures (species), colour palettes, and later
> accessories. It is opt-in and remembered across restarts and theme switches. It is cheap: no
> per-frame JavaScript while it's idle. It is accessible: hidden from screen readers, and a still
> pose under reduced motion. All art is made for Stanza. Other projects are inspiration only: no
> traced or recoloured sprites, and no copied code.

### Where it lives: one window, with a margin
- An app-provided layer, like the D16 effects — not theme art. Themes only declare where it may stand (below).
- When the companion is on, the native window grows by a margin **M = the pet's box** on all four sides (`fitWindowToTheme`, `src/window/nativeWindow.ts`). `.app-stage` (`src/App.css`) pads by M, and the window moves by −M, so the card doesn't jump on screen.
- The extra area is transparent and click-through already (Slice 3's hit region).
- **Rejected for life on the player:** a separate pet window. It lags behind while you drag the player. Leaving the player to roam the desktop is wanted since 2026-11-17 (D27), and the P2c spike measures that lag first (§5).

### Rendering: pixel grids → crisp SVG, no image files
- Each frame is a list of strings, one character per pixel, each character a palette index (`.` = transparent).
- `src/companion/spritePaths.ts` (pure) merges runs into one `<path>` per colour with `shape-rendering: crispEdges`. Colours come from custom properties `--mp-pet-1..8`, so a palette skin is a variable swap. The skin format is `docs/COMPANION.md`.
- **Scale:** one art pixel is always a whole number of device pixels: `round(2 × devicePixelRatio) / devicePixelRatio` logical px. At 125% and 150% scaling a fixed 2 px would give uneven pixels.
- **Layout grid (C1):** the sprite's box is the art rounded up to a multiple of 4 CSS px, and the pet's layer and moves stay on whole device px. Other lengths aren't stored exactly in the engines' 1/64 px layout units, and Chromium then blends the art's edge at 125% (DECISIONS.md 2026-10-18).
- **Frames and movement are discrete changes from JS timers, never CSS/WAAPI animations** (changed after the C0 spike, DECISIONS.md 2026-10-17). A `setTimeout` chain swaps in the next frame's paths (`useFrame`, C1), and steps the pet one or two art pixels along its path. Nothing is "running" between changes.
- **CPU budget, measured in the real exe (C0):** *any* running CSS/WAAPI animation, even a stepped 4 Hz one, keeps Chromium's compositor busy and costs ~2% of a core by itself. On top of that, every visible change costs ~3–6 ms of CPU, a re-composite of the whole transparent window (5.9 ms at T1's 404×664, 3.1 ms at T3's 312×150). So ≤ ~1% of a core on average means **≤ ~2 visible changes a second on average**.
- **Behaviour that fits the budget:** the pet is *still* most of the time (sit, idle and sleep are single frames with an occasional blink). Activity comes in short bursts: walks at ~4–5 steps a second, a few seconds at a time. It sleeps without changing at all while playback is paused or idle. The brain (C2) tracks a running budget of changes and enforces it; the e2e suite counts changes per minute.

### Surfaces
- Measured from `.mp-window`'s box. A ResizeObserver re-measures when the card's height changes with its state, or with T3's hover-reveal; the pet rides a moving edge.
- **Outer edges:** top (walk, sit), left and right (climb), bottom (hang — your sketch). Positions on outer edges sit outside the card, so they never overlap its content.
- **Inner ledge (optional):** a theme declares it in `theme.json`: `"companion": { "edges": [...], "shelf": … }`. The default is all four edges and no shelf. A shelf position must overlap no artwork, control, text part or source badge, and e2e enforces it. **Built in C5a (lab):** a shelf is a line that touches a side of the card. That end is its door: the creature steps on and off it there from a climb, and a drop down the card's face lands on it. The layer trims it to where no floor pose covers a part (`measureShelf`). **In the themes (C5b, contract v10):** `"companion": { "shelf": { "side": "left", "beside": ".mp-source-badge" } }` in T1, T2, T4 and T5, not drawn, a regular spot (your calls, DECISIONS.md); T3 has none.

### Brain
- `src/companion/brain.ts`: a pure, seeded state machine. It reuses `hashString` and `mulberry32` from `src/fx/beat.ts`, so tests are deterministic.
- **States (first set):** idle, walk, sit, climb, hang, sleep, wake, react, held, fall, land.
- **Inputs:** the surfaces, playback status (playing / paused / idle), track-change and click events, drag.
- **Choice:** weighted random behaviours, Shimeji-style.
- **Reduced motion:** a still sit pose, no walking.

### Interaction ("watch + pick up")
- `.mp-companion` carries `data-no-drag`, so the window-drag handler (C8) leaves it alone.
- A click plays the react animation. A drag (pointer capture) holds the pet over the card and the margin around it, never over the artwork (your call, 2026-11-01); on drop it falls onto the top from above, or down the card's face to catch the bottom edge (sliding off the artwork), or grabs a side or the bottom at once (C4a/C4b, DECISIONS.md).
- **Hit region:** `.mp-companion` joins the reported parts — re-measured on each of its own position changes (it knows when it moved), sent only when its box changed. C0 showed the sends themselves cost nothing measurable.
- **No-go zones:** the pet is interactive, so CLAUDE.md's rule ("interactive controls never on or over the artwork") applies to it. The planner treats the artwork, the controls and the source badge as no-go zones.

### Skins
- Bundled packages: `companions/<id>/companion.json` — id, name (from COPY.md), format version, grid size, named palettes, foot anchor, animations (`fps`, `loop`, frames, optional per-frame `durations`). Attachment points for accessories come later (D2), as a format change.
- A validator and registry mirror `src/theme/registry.ts` / `variant.ts`: enums only, every required animation present. Format documented in a new `docs/COMPANION.md`.
- **Three skin layers:** species (a new body), palette (a colour swap on the same body), accessory (an overlay on the attachment rig, later).

### Persistence, picker, contract, copy
- **Saved setting:** the appearance (`src/theme/appearance.ts`) gains an app-wide `companion: { on, skin, palette }`. Unlike variant overrides, it survives theme switches. Validated; old saved data stays valid.
- **On/off item (2026-10-22):** an icon with no text, the cassette awake (on) or asleep (off), by your choice (DECISIONS.md).
- **Picker:** the right-click menu (`src/window/themeMenu.ts`) gains a Companion submenu, keeping Slice 4's one-step-at-a-time menu lifecycle (the deadlock fix). Settings-window options come in M3.
- **Contract v7** (v6 went to the lyrics button, M1 R3b) lands with the first slice that puts companion parts in the production DOM (C2), not batched at the end: `.mp-companion` and its sprite part, `data-pet-state`, `data-pet-surface`, `--mp-pet-*`, and the `theme.json` `companion` field. Later slices update the doc in the same change.
- **Copy:** `docs/COPY.md` "Companion" section, all `[NEEDS COPY]` until you write it. No speech bubbles: emotes (heart, sleep) are pixel icons, not text.

### Designing the creature (together, as we go)
- C1 ships a deliberately plain "test dummy" so engineering never waits on art.
- **D1 design round:** three original concepts, animated in a dev-only **Companion lab** (`?lab=companion` in `DevHarness`), each tied to Stanza's type-first identity. First seeds to work out: a glyph critter, a bookworm, a tape critter. You pick or mix. **Outcome (2026-10-18): all three ship as species you choose between; `pilcrow` is the default.**
- **D2 design round:** more palettes, accessories (the three species came from D1).
- **Originality check per design:** compared against the references below (silhouette, palette, proportions), never traced or recoloured; logged in DECISIONS.md.

### Research (2026-10-17): what to learn from, what not to take

| Project | License | What we take (ideas only) | What we don't take |
|---|---|---|---|
| Claude's chat-box pet (your reference) | proprietary | Scale: a creature perched on a UI edge without blocking it | The crab silhouette or palette |
| Shimeji-ee | New BSD (code) | Actions split from behaviours, weighted behaviour choice, Fall/Dragged/Thrown as core states, edge climbing | Fan image sets (unclear rights) |
| eSheep (Windows clone) | open source | Walking on window edges, pick up and drop, a pet as one data file | Its sheep |
| oneko.js | MIT | A 32 px cell grid with states as frame lists; whole pet in a few kB | The neko sprites |
| vscode-pets | code license unconfirmed; art by credited third parties | Skins as colour variants of one body | Any art |
| VS Code chat pet sprite rules | — | Logical pixel = integer CSS px, nearest-neighbour; palette skins share geometry; accessory attachment rig; a still pose per state for reduced motion; `aria-hidden` visuals; timing in code, not images | — |
| Codex pets / Petdex | community spec | Pet = manifest + frames, rows = states; an installable, shareable format | Their atlas sizes |
| WindowPet | MIT | Proof that a Tauri + React pet overlay with click-through works | Its pets |
| BongoCat | MIT (Tauri) | Reacting to app state | Live2D (too heavy) |
| VPet | open source | Skins and mods as a community model | 200+ animations: a scope warning |

Pixel tools, if you want to draw yourself: Piskel (free, in the browser), Pixelorama (MIT), LibreSprite (GPL), Aseprite
(paid). None is required: frames are text grids. Links in §11.

---

## 4c. The home (D22) — P3

The player is the pet's room: one layout, designed with the pet instead of around it.

### Rules, fixed before the design round
- **One visual language.** Everything that isn't album art or text sits on the pet's art-pixel grid (`round(2 × dpr) / dpr` CSS px per art pixel, §4b) in a small fixed palette. No gradients, glows, glass, blur or soft shadows.
- **Compact.** The window's area sets what each visible change costs (C0), so the home's size is the pet's activity budget. P2b measures it.
- **The artwork is left alone** beyond what D10 allows, and nothing interactive sits on or over it. The pet counts as interactive.
- **The source badge stays visible** (`guard.css`).
- **Real controls stay.** Previous, play/pause, next, volume and the lyrics button are real buttons with names from COPY.md, reachable by keyboard and screen reader. Anything the pet can do for you (§4d) is in addition, never instead: the pet is `aria-hidden`.
- **Every state is designed:** playing, paused, nothing playing, Spotify not running, error, a long title, CJK and accented text, emoji, no artwork, each capability absent (the fixture matrix, §4).
- **Text:** titles and artists are real data in any script, so a pixel font alone can't carry them. The round decides between a system font set plainly and a pixel face with a fallback.
- **Reduced motion:** a still home and a still pet.
- **Opaque-rectangle fallback** (C6): it must look intentional if transparency fails.

### Perches
The home declares where the pet can be, replacing `theme.json`'s `companion.shelf`: the outline (top, sides, bottom), any ledges, and the moving ones of §4d (the front of the progress bar). They are measured from the real parts, as today (`src/companion/measure.ts`), so a part that moves or disappears takes its perch with it.

### Design round (H0)
1. **Brief, from you:** 3–5 references you'd call cool (a game, a toy, a poster, an app, anything), and what to avoid. My reading of what you disliked in the old themes, for you to correct: a dark rounded card, one loud accent colour, a serif title over monospace details, decoration that isn't driven by anything real.
   - **So far (2026-11-17), three references**, with what you take from each:
     - **Magenta's Lo-Fi Player** (a pixel-art room in the browser): the cozy mood, and touching things changes the music (§4d B3).
     - **Tamaweb** (a Tamagotchi-inspired web pet): the handheld LCD look, as a style. Not its care loop (D24), and not the egg-shaped device itself: the originality rule applies to the home as it does to the pet.
     - **Pocket Bird** (a desktop pet bird): taken for the pet, not the home: leaving the player (D27) and unlocks (D28).
   - **Still open:** what to avoid, and up to two more references (§10 #11).
2. **Sheet:** three directions, each drawn in the lab at real size in every state above, with the pet in it and each of §4d's behaviours shown.
3. **You pick, mix or reject.** Nothing is built from a first draft. If all three miss: another round, or start from a sketch of yours (the hanging pose came from one).

### Build
- **H1:** in the lab and the dev harness, against the fixture matrix, in both engines.
- **H2:** in the production player, replacing the hard-wired T1; the window sized to it; `docs/HOME.md` updated (parts, perches, tokens).
- **Gate:** every state in Chromium and WebKit; the guard's rules; the pet inside the window and over no part in a time-lapse; reduced motion; your visual review; the real exe.

### More than one home
Not planned. If ever wanted: a second bundled home with its own manifest. No public contract, no user themes.

---

## 4d. What the pet does with your music (D21, D24) — P2, P4

Today the pet's only link to the music is awake while it plays, asleep when it doesn't, and the same reaction on every track change. The rest is weighted-random wandering (§4b). That is the "lacks substance" problem in the pet itself. Four additions, each caused by something real, each built in the lab first and then in the player (as C2–C5 were).

### It knows your music (B1)
- **A local log** in the app data dir, written by Rust: per track (title + artist, the only identity GSMTC gives), its plays, skips and the last time. Capped in size. It never leaves the PC.
- **Tiers:** new to it, known, a favourite. **Events:** a skip (changed early), a finish, a repeat.
- **Reactions that mean something:** the heart only for a favourite; something curious for an artist it hasn't heard; dizzy after a run of skips. Emotes stay pixel icons, never text.
- **No chores (D24).** It is never hungry, sad at you or in need of upkeep. Nothing to maintain, nothing to lose.
- New animations are drawn for one species first, reviewed by you, then for the other two.

### It hears the music (B2; spike P2a first)
- **Source:** the peak meter of Spotify's own audio session. `src-tauri/src/spotify/volume.rs` already finds those sessions for the volume slider, and the same session object can be asked for `IAudioMeterInformation` (the `windows` crate version in use has it, behind the feature `Win32_Media_Audio_Endpoints`). It gives a level between 0 and 1, read a few dozen times a second in Rust. It is not audio: nothing is captured, recorded or stored.
- **Unverified.** Microsoft's reference documents this meter for an output device. Reading it per app is described by community sources and an MSDN blog post (§11), and a commenter there warns it isn't guaranteed. **P2a decides:** does it work for Spotify, does it follow real tracks, is it independent of Stanza's own volume slider, what happens on another output device, what does it cost.
- **Use:** a slow loudness level (quiet, medium, loud, with hysteresis) sets how lively the pet is. A pulse, if P2a finds one reliable enough, times its dance frames. **Fallback** if the pulse is too coarse: liveliness from loudness alone, which is still real.
- **Budget:** one pose change per beat at 120 BPM is 120 changes a minute, over today's cap of 90, which was sized on T1's cost per change. P2b re-measures that cost in a compact window and re-derives the cap. The dance halves its rate before it breaks it.
- **Claims:** once this lands, saying the pet reacts to the music is true, where D16 forbade it. Only for what it does: loudness and pulse, not pitch or genre.

### It uses the player (B3; needs the home, P3)
- **Riding the progress bar:** a perch at the bar's front. Sitting there, where it is is where the song is. Its steps can land on the one-second position tick the player already redraws on.
- **Drop to seek:** dropped on the bar, the song seeks to that point (`caps.seek`). Keyboard seek stays the accessible way.
- **More perches** come out of the home's design round (§4c), which shows each one.
- **Touch changes music** (your pick from the Lo-Fi Player, 2026-11-17): things in the home, or the pet, that you touch play, pause, skip or change volume. In addition to the real buttons, never instead (§4c). Which objects and which gestures is settled in H0 (§10 #16), so that a click meant for the pet (react) or a drag (carry) never skips a track by accident.

### It grows with your listening (B4, D28; needs B1)
- **Unlocks:** new pets or accessories, earned from the listening log (B1). Your pick from Pocket Bird (2026-11-17).
- **Never a chore (D24):** never lost, never on a timer, nothing to keep up. Nothing you have today gets locked.
- **Local only,** like the log.
- **Open (§10 #17):** what unlocks, and earned how.

### Gates (each of B1–B4)
- **Unit:** the brain simulated for hours, seeded, as today.
- **e2e:** a fake-clock time-lapse in the home × the fixture matrix: in the window, over no part, within the change budget; reduced motion still.
- **Real exe:** CPU with music playing (never measured in M2), with your OK to have Spotify playing.

---

## 4e. Make your own pet (D23) — P5

Customization is still what the project is for. The pet is where it lives now.
- **Built (M2):** three species, five palettes each, four accessories on a rig; the picker in the right-click menu and the settings window.
- **User pets:** a folder per pet in `<app data dir>/companions/`, the same `companion.json` as the bundled ones (`docs/COMPANION.md`), validated in Rust and again in the frontend. A broken one is never offered. A good one shows in the picker beside the bundled ones.
- **Live reload:** save the file and the pet on screen changes, as user themes did (M3 L3). The watcher and the validate-then-offer flow are restored from `themes-final` and pointed at pets.
- **Importer:** a sprite sheet drawn in Aseprite, Piskel or Pixelorama becomes a `companion.json` (frames to grids, colours to a palette). The sheet's layout is decided in P5.
- **Guide:** how to draw one: the eleven required animations, the rig, the rules it must pass.
- **Open for P5:** where a user pet's name comes from. A bundled one's is a COPY.md entry; a user's would be its author's own words in its own file, as a theme's `name` was.
- **Gate:** a pet drawn outside the repo loads, hot-reloads and passes the placement rules in the home; a broken file changes nothing on screen.

### Artist pets (D26, 2026-11-17)
Your idea: a pet that is an artist you listen to (your example: Playboi Carti), walking round the player.
- **Made outside Stanza, then imported.** Drawn by hand or with a sprite tool (SpriteBrew, sprite-sheet-creator, §11). Stanza has no AI generation in it: that would need the network, an API key, a cost per pet and sending your picture to a third party, and Stanza is offline under a strict CSP.
- **The importer** (above) also reads Aseprite JSON, which SpriteBrew exports. It shrinks frames to the grid (8–32 art px, nearest-neighbour) and cuts colours to 8 (`docs/COMPANION.md`). SpriteBrew's frames are 64×64, so most of their detail goes.
- **Simple pets (format 3, with P5's code).** The sprite tools make about 4 of the 11 required poses (walk, idle, jump, attack; no climb, hang, held, sit or sleep). A user pet may ship idle and walk plus any others it has. Without `climb` and `hang` it stays on the top edge, and a missing pose falls back to one it has. Today the brain refuses a skin that lacks any required pose (`src/companion/brain.ts`) and nothing lets a pet skip edges, so this is new brain work. `docs/COMPANION.md` bumps `format` in the same change.
- **The artist link.** A pet can name an artist. When Spotify's current artist matches, it comes out or reacts (which, decided in P5). It's driven by real state (the artist GSMTC reports), so it passes "nothing pretends" (§0), and it's what makes the pet more than a costume. Matching is open (§10 #18).
- **Likeness.** A user's pet is its author's. Stanza never bundles, demos (README, video) or ships a pet of a real person. Not legal advice.
- **Gate:** a pet with only idle and walk, imported from a SpriteBrew export, loads, stays on the top edge, and comes out when its artist plays.

---

## 5. Status and roadmap

Every step ends in a gate. Nothing moves forward on "should work." Work runs as **one slice per "continue"**, committed locally on `main`, never pushed unless you ask. No hour estimates in v3: v2's were rough, and the two biggest steps (P3, P4) depend on design rounds.

### Where we are (2026-11-16)
- **Built and staying:**
  - **M1 Real music** (done 2026-10-17): the GSMTC adapter, transport, position within 0.2 s over 5 minutes, keyboard seek, "Spotify not running" with recovery, Spotify's own volume, the lyrics button.
  - **M2 The pet** (automated gate passed 2026-11-07): renderer, skin format v2, the brain, the whole outline, click / pick up / drop, a shelf, the picker, three species × five palettes × four accessories, the lab.
  - **The window** (Slices 2, 3, 5, 6): frameless, transparent, always on top, click-through, drag, position remembered, a real CSP.
  - **M3 L4a:** the settings window's shell and its companion section.
- **Built and being retired (D20, D21):** the five themes and the theme list in the menu (Slice 4), the remembered theme and variant (Slice 1), user themes and live reload (M3 L2/L3), the `theme` and `user` cascade layers (M3 L1), the effects layer. Tag `themes-final`.
- **Dropped unbuilt:** M3 L4b (theme previews), L5 (customizer), L6 (snippets, theme `.zip`), S7 (genre fonts).
- **Tests at the last full run (2026-11-08):** 622 unit (Vitest), 959 e2e + 65 skipped (Playwright, Chromium + WebKit), `cargo test` 35. P1 removes the theme and effect tests with their features, so the counts drop; each P1 slice reports the new ones.
- **Open from before, still open:** your visual review of the pet (the M2 gate); CPU with music playing; the Store build of Spotify; real 125%/150% displays.

### History: v2's milestones
The slice names (M1 R1, M2 C2b, M3 L3, …) are cited by code comments and DECISIONS.md, which has the detail. v1's phases 0–8 and how they mapped onto these are in PLAN.md v2 (git history).

| Milestone | What | Outcome |
|---|---|---|
| M0 | Plan v2 | Done |
| M1 R1–R3b | Real music: adapter, position and seek, volume, lyrics button | Done 2026-10-17 |
| M1 R4 | Tray, and hiding while Spotify is closed | Not built → P6 |
| M2 C0–C6, D1–D2c | The pet: spike, renderer, brain, all edges, pick up, shelf, picker, palettes, accessories | Done; automated gate passed 2026-11-07, your visual review open |
| M3 L1–L3 | Cascade layers, runtime theme loader, hot swap | Built 2026-11-08; retired by D20 (the guard layer stays) |
| M3 L4a | Settings window | Built 2026-11-08; stays, without its themes section and Reset appearance |
| M3 L4b, L5, L6, S7 | Theme previews, customizer, snippets and `.zip` import, genre fonts | Dropped by D20 |
| M4 | Shell and Windows release | → P6 |
| M5 | macOS | Post-launch, untested |
| M6 | Portfolio packaging | → P6 |

### P0 — Docs · done 2026-11-16
This plan, the decision logged (DECISIONS.md), `CLAUDE.md`'s direction, contract and quality-bar rules, the tag `themes-final`. No code.
**Gate:** you approve the wording.

### P1 — Clear the ground
Remove what D20 and D21 retire, in three slices that each leave `main` working. T1 stays, hard-wired, as a temporary face until the home (P3).
- **P1a Effects, and the other four themes.**
  - `src/fx/` (shapes, waveform, the simulated beat, text effects, split-flap, flow, morph, debris), the `fx` field and the variant's `effects`, and their tests.
  - The libraries only they use: `animejs`, `matter-js`, `@splitflap/core`.
  - Themes T2–T5, and the theme list in the right-click menu. The pet's items and the gear stay.
  - `hashString` and `mulberry32` move from `src/fx/beat.ts` to the pet, which uses them.
- **P1b User themes, variants, the saved appearance.**
  - `src/theme/userThemes.ts`, `liveThemes.ts` and the variant model.
  - Rust: `themes.rs`, `theme_watch.rs`, the `notify` crate, the asset protocol and its CSP entries.
  - The settings window's themes section and Reset appearance; the fixtures in `dev/fixtures/user-themes` and `user-theme-edits`.
  - The saved setting shrinks to the pet's, with your current choice carried over.
  - The pet on by default (D25).
- **P1c The contract.**
  - `docs/THEME_CONTRACT.md` and its doc tests retire. `docs/HOME.md` starts as the short list of the parts that remain and the guard's rules, and `CLAUDE.md` points at it.
  - The cascade layers shrink to what's left.
  - COPY.md's theme, effect, customizer and snippet slots go (about 28 of the 68 empty ones).
- **Gate (each slice):** `tsc`, Vitest, Playwright in both engines, `cargo test`, `npm run build` with the fixtures check. In the real exe: it starts, shows your music, the pet behaves as before, and (P1b) your saved pet survives the change of format. Each slice reports test counts and bundle size before and after.

### P2 — Three spikes
On throwaway branches; the learnings go to DECISIONS.md, not the code (§8).
- **P2a Loudness.** Read Spotify's session peak meter from the volume thread and log it against real tracks. The questions are in §4d. It only reads, and it needs your OK to have Spotify playing.
  **Gate:** silent when paused; follows loud and quiet passages; the five questions answered in writing; a first attempt at a pulse scored on a handful of your tracks, logged as numbers, not titles.
- **P2b The cost of a change in a small window.** C0's method, at a few candidate window sizes.
  **Gate:** ms per visible change at each size, and the change budget re-derived from it.
- **P2c The pet leaves the player (D27).** A separate small pet window, Shimeji-style. The questions:
  - how far it lags behind the player while you drag it (the reason it was parked, §4b);
  - its CPU while it moves;
  - click-through around it;
  - what it can walk on: the taskbar, the screen edges, other windows;
  - more than one monitor, and their scaling.

  **Gate:** the numbers in DECISIONS.md. Then you decide whether it's built, and when.
- P2 can run before, during or after P3's design round.

### P3 — The home (§4c)
- **H0** the design round: your brief, a sheet of three directions, your pick.
- **H1** in the lab. **H2** in the player, replacing T1.
- **Gate:** in §4c.

### P4 — What the pet does with your music (§4d)
- **B1** it knows your music (needs nothing else; can start any time after P1).
- **B2** it hears the music (needs P2a).
- **B3** it uses the player (needs P3).
- **B4** it grows with your listening: unlocks (needs B1).
- Each as `a` (lab) then `b` (player). **Gates:** in §4d.

### P5 — Make your own pet (§4e)
User pets from a folder, validation, live reload, the importer, the guide. **Gate:** in §4e.

### P6 — Ship (v2's M1 R4, M4 and M6)
- **Tray:** an icon with show/hide and quit, and hiding while Spotify is closed (R4: needs copy and an icon image). Then the pet's options and quit in the tray menu.
- Autostart, single-instance, multi-monitor and DPI handling.
- The app icon (the pet) → `npx tauri icon`; NSIS installer; GitHub Actions Windows build; a README note that unsigned builds trigger SmartScreen.
- README, the pet authoring guide, a demo video.
- **Gate:** reboot with autostart on; position and scale correct at 100 / 125 / 150% display scaling; uninstall the dev build, install the CI artifact, full smoke test; someone else installs it, picks a pet and adds one of their own from the README alone.
- **macOS** (v2's M5: AppleScript adapter, Info.plist key + entitlement, a bundled-build test on a real Mac): post-launch. Until that gate passes the README says macOS is **untested**. Your Mac is school-managed (§10 #1), so it may not be possible.

### Which machine
- **Windows only:** every Rust change (P1b, P2a, P2c, B1's log, B2, P5's watcher, P6) and every real-exe gate.
- **The school Mac** (Node only: `tsc`, Vitest, `npm run build`) can take lab, brain and art slices. That work arrives uncommitted and is run in Playwright and the real exe, then committed, on Windows.

### Post-v1 expansion (not yet phased)
Per D15, grouped together as the next body of work after P6, no order decided yet:
- **SoundCloud support** — run the deferred S3 spike, build `SoundCloudAdapter`, source-switching UI (D9), attribution/link-out (C13).
- **Windows any-app mode** — broaden the GSMTC adapter beyond the Spotify-only AUMID filter to show any active media session.

---

## 6. Definition of done (before any promotion)

- **The home** passes the fixture matrix in both engines and the guard's rules, with your visual sign-off.
- **The pet:** every required state in all three species; inside the window and over no part in every state; the change budget met; a still pose under reduced motion.
- **Substance (§4d):** it reacts to the real loudness (or P2a's fallback), its reactions follow your listening log, and it uses at least one perch tied to the song.
- **Make your own (§4e):** a pet drawn outside the repo installs from a folder and hot-reloads; the guide exists.
- **The bar (§0):** no theme system, no effect toggles, nothing simulated, no `[NEEDS COPY]` visible in the shipped app.
- M1's gates still pass; P6's gate passed.
- Private beta: 3–5 testers (Win10/Win11, different display scaling, Spotify installer vs Store build)
- macOS: post-launch, marked untested in README

---

## 7. Risk register
Likelihoods are qualitative — there's no reliable base rate for any of these.

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| The home still looks generated | Med | High (it is the reason for the pivot) | Your references first; the grid and a small palette as constraints; three directions; your pick; never a first draft; another round or your sketch if all three miss |
| The session peak meter doesn't work for Spotify, or is too coarse to find a pulse | Unknown → P2a | High for "it hears the music" | Fallback: liveliness from loudness alone. A heavier option only if you want it: capturing Spotify's output, as its own spike |
| Art multiplies: every new animation × three species × four accessories | Certain | Med | One species first, reviewed, then the others; movement from offsets before new frames |
| A livelier pet costs CPU on an always-on-top window | **Measured (C0):** 3–6 ms per visible change; any running CSS animation ~2% of a core by itself | Med | JS-timer frames (no CSS animations); a change budget re-derived for the home's size (P2b) and enforced by the brain; still when paused; the dance halves before it breaks the budget |
| Removing ~8,500 lines breaks something that stays | Med | Med | Three slices; the full suites and the real exe after each; `themes-final` to go back to |
| The pet hides controls or the source badge | Low (by design) | High (usability, attribution) | No-go zones in the planner; e2e time-lapse in every state |
| The listening log grows without bound, or reads as tracking | Low | Med | Capped; local only; said plainly in the README; a way to clear it |
| Scope creep (pet care, more homes, more species; since 2026-11-17 also desktop roaming, unlocks, artist pets) | High | Med | §9; one home and three species until P6; roaming only if P2c passes and you choose it; artist pets are user pets, not new bundled species |
| A user's pet shows a real person (artist pets, D26) | Likely, by design | Med (likeness) | A user's pet is its author's; Stanza never bundles, demos or ships one; the README and demo video use original pets |
| Creature art too close to someone else's | Low | High | Original designs only; per-design originality check, logged. A user's pet is its author's |
| Spotify update changes GSMTC behaviour | Low–med | High | Adapter isolation, capability flags |
| Pixel art looks uneven at 125%/150% scaling | Med | Med | Whole-device-pixel scale (§4b); checked in C0 and the lab |
| School workload stalls a half-built step | — | Med | One slice per turn; every slice leaves `main` working |
| No Mac access | Likely limited (school-managed MacBook) | High for a cross-platform claim | Windows-first; label macOS untested |
| Transparency fails in a bundled mac build | Med (open issue exists) | Med | Opaque-rectangle design rule (§4c) |
| Widget stops or throttles when window hidden | Unknown → S3 (post-v1) | High for SoundCloud mode | Keep window alive minimised/off-screen instead of hidden |
| SoundCloud terms ambiguity | — | Med | D9, attribution, non-commercial |

---

## 8. Claude Code workflow

Targets the "confirmed it understood, then failed repeatedly" problem.

1. **One task = one gate.** Before editing, Claude Code states: files it will touch, the acceptance check, the exact command it will run to verify. Plan mode for anything touching more than two files.
2. **Verification ladder.** Claude runs 1–3 itself; you do 4.
   1. `npx tsc --noEmit` + lint
   2. `cargo check` + `cargo clippy` (+ `cargo test`, `cargo fmt --check`)
   3. Unit tests / Playwright fixture runs (Chromium + WebKit); `npm run tauri build -- --no-bundle` and a real-exe drive for window, native or CSP work
   4. Your visual check — in the real exe for any window, transparency or permission work
3. **"Done" wording.** Claude may only say "passes X" for checks it ran and quotes. Visual work = "ready for your review," never "done."
4. **Two-strike rule.** Same task fails twice → stop, write a diagnosis (what was assumed, what the logs show, what's different from the docs) before attempt three. No blind retries.
5. **Spikes stay on throwaway branches.** Merge the learnings into `DECISIONS.md`, not the code.
6. **Real-exe runs:** check first that your own Stanza exe isn't running (a second instance shares its WebView2 profile and saved theme).

The project rules live in `CLAUDE.md` at the repo root. (v1 of this plan carried a seed copy here; it had the pre-2026-09-22 artwork rule and was removed.)

---

## 9. Parking lot (not v1)

- Apple Music, YouTube Music, local files, Linux
- Spotify Web API features (like/save, queue, search) — only with Premium and the 5-user dev cap
- SoundCloud API features (search, logged-in likes) — needs Artist Pro
- Audio analysis beyond loudness (pitch, spectrum, a visualiser). D21 reads a level from Spotify's audio session and nothing more. Capturing Spotify's stream is possible on Windows but a separate project; the SoundCloud iframe is cross-origin.
- Lyrics inside Stanza (S6 only brings Spotify's own window forward)
- A gallery for sharing pets
- Notarised or store distribution
- The pet: more than one pet at once; moving along the bottom edge (`hang` has no step); hopping down to a ledge
- A second home (§4c)
- S8 arbitrary window silhouettes (rectangular click-through is done, Slice 3)
- **Retired, not parked (D20):** themes, user themes, the customizer, CSS snippets, theme packages, an in-app CSS editor, genre fonts. Recoverable from `themes-final`.
- **Rejected, not parked (D24):** pet-care stats (hunger, mood to keep up, growth).
- **Un-parked (D27, 2026-11-17):** the pet roaming the whole desktop (Shimeji-style, a second window). Now the P2c spike (§5).

---

## 10. Open questions

1. Do you have regular access to a Mac? **Answered:** it's a school-regulated MacBook — take macOS as uncertain until actually tested; school device management may restrict signing, dev tools, or permissions.
2. Fixture policy: synthetic strings (recommended) or real metadata you supply? **Never formally answered**; fixtures have been synthetic since Phase 2. Say if you want otherwise.
3. Tagline. **Open.** v2's draft described the themed player and no longer fits.
4. Spotify Premium — only matters if Web API features ever come back. **Answered:** confirmed, you have Premium.
5. Windows any-app mode (show any media session, not only Spotify)? **Answered:** confirmed desired — Post-v1 (§5), order relative to SoundCloud TBD (D15).
6. SoundCloud in the finished scope? **Answered:** deferred — v1 ships Spotify-only (D15); the S3 spike waits until Post-v1.
7. The pet's copy: species, palette and accessory names, menu labels. **Open** — `[NEEDS COPY]` until you write them.
8. Which creature? **Answered (D1):** all three. **New:** are they keepers as drawn? Default taken: yes, they get new animations, not a redraw.
9. S7 genre fonts. **Closed:** dropped with the theme system (D20).
10. Split-flap in-between glyphs. **Closed:** removed with the effects layer (P1a).
11. **Your references for the home** (§4c, H0). **Partly answered (2026-11-17):** three references (Lo-Fi Player, Tamaweb, Pocket Bird) and what you take from each, in §4c. **Open:** what to avoid, and up to two more. The design round waits for them.
12. **Reading Spotify's loudness** (D21). Default taken: acceptable. Re-asked at P2a.
13. **A local listening log** (D24). Default taken: acceptable. Re-asked at P4.
14. **The pet on by default** (D25). Default taken. Re-asked at P1b.
15. **The name.** "Stanza" was chosen for a typography-first player; it also means "room". Default taken: keep it.
16. **Touch changes music** (§4d B3). **Open:** which objects in the home, or which gestures on the pet, control playback, so that a click meant for the pet never skips a track. Settled in H0.
17. **Unlocks** (D28, §4d B4). **Open:** what unlocks, and earned how.
18. **The artist link** (D26, §4e). **Open:** how a pet's artist matches the artist GSMTC reports, which may name several artists in one string (unchecked); and what "comes out" means, in place of your usual pet or as a reaction.

---

## 11. Sources

- Spotify quota update, July 23 2026 — developer.spotify.com/blog/2026-07-23-web-api-quota-updates
- Spotify Web API changelog, July 2026 — developer.spotify.com/documentation/web-api/references/changes/july-2026
- Spotify Dev Mode changes, Feb 2026 — techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/
- Spotify Design & Branding (current) — developer.spotify.com/documentation/design
- Spotify Design & Branding (legacy radius values) — developer.spotify.com/documentation/general/design-and-branding/
- SoundCloud: Get an API key — developers.soundcloud.com/docs/api/register-app
- SoundCloud: self-serve keys announcement — developers.soundcloud.com/blog/vibe-coding-ai-agent-docs-self-serve-api-keys/
- SoundCloud API README (stale FAQ) — github.com/soundcloud/api
- SoundCloud API Terms of Use — developers.soundcloud.com/docs/api/terms-of-use
- SoundCloud Widget API — developers.soundcloud.com/docs/api/html5-widget
- Artist Pro pricing (Dec 2024) — techcrunch.com/2024/12/17/soundcloud-introduces-a-new-cheaper-paid-plan-for-artists
- MediaRemote 15.4 entitlement lock — docs.rs/crate/media-remote/latest
- AppleScript Info.plist vs entitlement — developer.apple.com/forums/thread/710896
- Tauri mac transparency lost after bundling — github.com/tauri-apps/tauri/issues/13415
- Drag-region click-target behaviour — github.com/tauri-apps/tauri/pull/1656
- window-vibrancy platform notes — github.com/tauri-apps/window-vibrancy
- GSMTC timeline position — learn.microsoft.com (GlobalSystemMediaTransportControlsSessionTimelineProperties.Position)
- tauri-action (CI builds) — github.com/tauri-apps/tauri-action

**Companion research (2026-10-17).** License notes are as found; re-check a project's LICENSE file before relying on it. No art or code from these is used.
- Shimeji-ee (New BSD) — github.com/gil/shimeji-ee
- eSheep, Windows clone — apps.microsoft.com/detail/9mx2v0tqt6rm
- oneko.js (MIT) — oneko.clove.is-a.dev (source: github.com/adryd325/oneko.js)
- vscode-pets — github.com/tonybaloney/vscode-pets
- VS Code chat pet sprite rules — skills.cat/skills/microsoft/vscode/chat-pet-sprite-creation
- Codex pet format (community) — cdn.jsdelivr.net/npm/@omega3_0/nanoagent@1.1.0/skills/hatch-pet/references/codex-pet-contract.md; Petdex — github.com/crafter-station/petdex
- WindowPet (MIT, Tauri + React) — github.com/SeakMengs/WindowPet
- BongoCat (MIT, Tauri) — hellogithub.com/en/repository/ayangweb/BongoCat
- VPet — store.steampowered.com/app/1920960/VPet_Simulator/
- Pixelorama (MIT) — github.com/orama-interactive/pixelorama; Piskel — best-of-web.builder.io/library/piskelapp/piskel

**Loudness (2026-11-16).** Found by a web search; none of these pages has been read yet. P2a reads them before relying on anything.
- Peak meters (Core Audio) — learn.microsoft.com/windows/win32/coreaudio/peak-meters
- `IAudioMeterInformation` (endpointvolume.h), documented for an endpoint device — msdn.microsoft.com/en-us/library/vs/alm/dd368227
- Per-app meters, community-documented: Matthew van Eerde, "Getting peak meters and volume settings for all apps and audio devices on the system" — blogs.msdn.microsoft.com/matthew_van_eerde/2013/09/26/getting-peak-meters-and-volume-settings-for-all-apps-and-audio-devices-on-the-system; Stack Overflow question 14313692, "Peak meters for individual programs on Windows 7"
- `windows` crate binding — microsoft.github.io/windows-docs-rs/doc/windows/Win32/Media/Audio/Endpoints/struct.IAudioMeterInformation.html

**References and sprite tools (2026-11-17).** The three reference pages couldn't be opened from the cloud session (its network blocks them), so what this plan says about them comes from web search summaries. The two tools' READMEs were read through a summarising fetch, not line by line.
- Lo-Fi Player (Magenta, Vibert Thio) — magenta.withgoogle.com/lofi-player; magenta.tensorflow.org/lofi-player; source (archived) github.com/magenta/lofi-player
- Tamaweb (SamanDev) — tamawebgame.github.io; samandev.itch.io/tamaweb
- Pocket Bird (Idrees) — idreesinc.itch.io/pocket-bird
- sprite-sheet-creator (fal.ai; licence not shown) — github.com/blendi-remade/sprite-sheet-creator
- SpriteBrew (AGPL-3.0; Retro Diffusion) — github.com/GAlbanese09/spritebrew; spritebrew.com
