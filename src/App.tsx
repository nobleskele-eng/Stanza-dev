import "./theme/shell.css";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { copy } from "./copy";
import { currentWindowLabel, installPlayerBridge, publishAppearance, SETTINGS_LABEL } from "./settings/bridge";
import { SettingsApp } from "./settings/SettingsApp";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dress } from "./companion/accessory";
import { SKINS } from "./companion/registry";
import { artPixelPx, spriteBoxPx } from "./companion/pixel";
import { useDevicePixelRatio } from "./companion/useDevicePixelRatio";
import { SpotifyAdapter } from "./adapters/spotifyAdapter";
import { PlayerStore } from "./store/playerStore";
import { useInterpolatedPosition, useStoreSnapshot } from "./store/usePlayback";
import { flushSync } from "react-dom";
import {
  defaultAppearance,
  loadAppearance,
  pickCompanion,
  refreshAppearance,
  saveAppearance,
  selectTheme,
  type Appearance,
  type CompanionSetting,
} from "./theme/appearance";
import { oneAtATime, planRescan, ThemeChanges, withTheme, type ThemesChanged } from "./theme/liveThemes";
import { DEFAULT_THEME, MANIFESTS } from "./theme/registry";
import { loadThemeSheet, loadUserThemes, mergeManifests, scanUserThemes, type ThemeSheet, type UserTheme } from "./theme/userThemes";
import { variantToDom } from "./theme/variant";
import { DevHarness } from "./dev/DevHarness";
import { Player } from "./player/Player";
import { installSeekKeys } from "./player/seekKeys";
import { fitWindowToTheme, installHitRegion, installWindowDrag } from "./window/nativeWindow";
import { installThemeMenu } from "./window/themeMenu";

/**
 * Real playback (PLAN.md §5, M1 R1): Spotify through the Rust GSMTC worker (src-tauri/src/spotify).
 * Only inside Tauri; in a plain browser (vite preview, e2e without the IPC fake) the player stays idle.
 */
function useSpotify(): PlayerStore | null {
  const [store] = useState(() => (isTauri() ? new PlayerStore() : null));
  useEffect(() => {
    if (!store) return;
    store.registerAdapter(new SpotifyAdapter());
    store.switchSource("spotify");
    // ←/→ seek 5 s (M1 R2); no visible seek control exists in the v1 contract.
    const removeKeys = installSeekKeys(() => store.getSnapshot(), (ms) => store.seek(ms));
    return () => {
      removeKeys();
      store.stop();
    };
  }, [store]);
  return store;
}

/** What the player starts from: the user themes, and the saved appearance, its user theme's CSS loaded. */
interface Boot {
  /** The user themes found at launch (M3 L2). Live reload (M3 L3) changes them after. */
  userThemes: Record<string, UserTheme>;
  appearance: Appearance;
  /** Removes the active user theme's sheet, if the saved theme is one. */
  removeSheet: (() => void) | null;
  /** Changes to the themes folder, from just before the launch's listing. */
  changes: ThemeChanges;
}

/**
 * Before the first paint: find the user themes, so a saved user theme isn't mistaken for an unknown one (and reset to
 * the default), then load its CSS, so it never paints unstyled. A user theme whose CSS fails to load is dropped (until
 * its folder changes) and the default theme takes its place. Outside Tauri there are no user themes.
 */
async function boot(): Promise<Boot> {
  // Listening first, so a theme saved while the folder is being listed still reaches the app.
  const changes = new ThemeChanges();
  await changes.ready;
  const userThemes = await loadUserThemes(MANIFESTS);
  let appearance = loadAppearance(window.localStorage, mergeManifests(MANIFESTS, userThemes));
  let removeSheet: (() => void) | null = null;
  const user = userThemes[appearance.theme];
  if (user) {
    try {
      const sheet = await loadThemeSheet(user);
      sheet.show();
      removeSheet = sheet.remove;
    } catch (err) {
      console.error("user theme failed to load", appearance.theme, err);
      delete userThemes[appearance.theme];
      appearance = defaultAppearance(MANIFESTS, DEFAULT_THEME, appearance.companion);
    }
  }
  saveAppearance(window.localStorage, appearance); // normalises anything stale or invalid on disk
  return { userThemes, appearance, removeSheet, changes };
}

/** The two windows' sizes, side by side: big enough for either theme, so neither is clipped while they swap. */
const spanning = (a: { width: number; height: number }, b: { width: number; height: number }) => ({
  width: Math.max(a.width, b.width),
  height: Math.max(a.height, b.height),
});

function ProductionApp({ boot }: { boot: Boot }) {
  const store = useSpotify();
  const nowPlaying = useStoreSnapshot(store);
  const positionMs = useInterpolatedPosition(nowPlaying);
  // The user themes on offer (M3 L2), kept up to date with the folder while the app runs (M3 L3).
  const [userThemes, setUserThemes] = useState(boot.userThemes);
  const manifests = useMemo(() => mergeManifests(MANIFESTS, userThemes), [userThemes]);
  const latest = useRef({ manifests, userThemes });
  latest.current = { manifests, userThemes };
  // The active theme + variant persist across restarts; right-click picks the theme (Slice 4).
  const [appearance, setAppearance] = useState(boot.appearance);
  // What's on screen (`active` below is the latest pick, which may still be loading).
  const shown = useRef(appearance);
  shown.current = appearance;
  const active = useRef(appearance.theme);
  // Loaded user-theme sheets by theme id. Only the shown theme's is kept (and a pick's that's still on its way),
  // removed once another theme has rendered.
  const sheets = useRef(new Map<string, () => void>(boot.removeSheet ? [[boot.appearance.theme, boot.removeSheet]] : []));
  useEffect(() => {
    for (const [id, remove] of sheets.current)
      if (id !== appearance.theme && id !== active.current) {
        remove();
        sheets.current.delete(id);
      }
  }, [appearance.theme]);
  /** Swaps in a newly loaded sheet for `id`: the new one applied and the old one gone in the same task. */
  const putSheet = useCallback((id: string, sheet: ThemeSheet) => {
    sheet.show();
    sheets.current.get(id)?.();
    sheets.current.set(id, sheet.remove);
  }, []);
  /** Offers these user themes, never dropping the one on screen (its own case moves off it first). */
  const offer = useCallback((next: Record<string, UserTheme>) => {
    const id = shown.current.theme;
    const kept = latest.current.userThemes[id];
    const themes = kept && !next[id] ? withTheme(next, id, kept) : next;
    if (JSON.stringify(themes) !== JSON.stringify(latest.current.userThemes)) setUserThemes(themes);
  }, []);
  const companion = useRef(appearance.companion);
  companion.current = appearance.companion;
  // Last size asked of the native window, so a switch that already grew it to the new size isn't repeated.
  const sizedTo = useRef("");
  // The companion (M2 C2b, C3b): off until turned on, kept across theme switches. On, the window grows by a margin on
  // every side, the pet's box, so it can walk the card's top, climb its sides and hang under it without the card
  // moving on screen.
  const dpr = useDevicePixelRatio();
  // What it wears (D2c) is painted into its frames, so the player and its rules see the dressed creature. Kept until
  // the choice changes: a new skin object makes the layer measure the card again.
  const species = SKINS[appearance.companion.skin];
  const skin = useMemo(() => dress(species, appearance.companion.accessory), [species, appearance.companion.accessory]);
  const margin = appearance.companion.on ? spriteBoxPx(skin.grid, artPixelPx(dpr)) : 0;
  const marginRef = useRef(margin);
  marginRef.current = margin;
  // The companion's margin currently reflected in the window's position (it grows the window left and up). It starts
  // at the launch margin, not 0: tauri-plugin-window-state restores the position saved at the last exit, which already
  // includes the margin if the companion was on, so shifting again would move the card a margin on every launch.
  const shifted = useRef(margin);
  const sizeWindow = useCallback((size: { width: number; height: number }, margin: number) => {
    const width = size.width + 2 * margin;
    const height = size.height + 2 * margin;
    const key = `${width}x${height}`;
    const move = shifted.current - margin;
    if (key === sizedTo.current && !move) return Promise.resolve();
    sizedTo.current = key;
    shifted.current = margin;
    return fitWindowToTheme({ width, height }, move);
  }, []);
  // The native window takes the active theme's declared size. The player is centred side to side
  // and pinned to the top (.app-stage; docs/DECISIONS.md, Slice 6).
  useEffect(() => {
    void sizeWindow(manifests[appearance.theme].window, margin);
  }, [manifests, appearance.theme, margin, sizeWindow]);
  useEffect(() => installWindowDrag(), []);
  // Clicks pass through the transparent part of the window (docs/DECISIONS.md, Slice 3).
  useEffect(() => installHitRegion(), []);

  // Theme picker (Slice 4). Switching clears the old theme's overrides (selectTheme) and is saved at once.
  // The window first grows to fit both themes so neither is clipped while React swaps them; the effect
  // above then sets the new theme's exact size. A user theme's CSS is loaded first (M3 L2), so it never paints
  // unstyled; if it fails, nothing changes. Loaded afresh on every pick, so edits made while it wasn't on screen show
  // (M3 L3). A newer pick made while it loaded wins.
  const pickTheme = useCallback(
    (id: string) => {
      const from = active.current;
      if (id === from || !latest.current.manifests[id]) return;
      active.current = id;
      const user = latest.current.userThemes[id];
      const ready = user
        ? loadThemeSheet(user).then((sheet) => {
            if (active.current !== id) sheet.remove(); // picked something else meanwhile
            else putSheet(id, sheet);
          })
        : Promise.resolve();
      ready
        .then(() => {
          if (active.current !== id) return;
          const now = latest.current.manifests;
          // Its folder went while it loaded: stay where we are.
          if (!now[id]) {
            active.current = shown.current.theme;
            sheets.current.get(id)?.();
            sheets.current.delete(id);
            return;
          }
          const next = selectTheme(now, id, companion.current);
          saveAppearance(window.localStorage, next);
          return sizeWindow(spanning((now[from] ?? now[id]).window, now[id].window), marginRef.current).then(() => setAppearance(next));
        })
        .catch((err) => {
          console.error("user theme failed to load", id, err);
          if (active.current === id) active.current = from;
        });
    },
    [sizeWindow, putSheet],
  );

  // Live reload (M3 L3): the themes folder changed, so list it again; then, for the theme on screen, reload it, keep
  // it as it is, or (its folder gone) move to the default theme. One at a time, changes arriving meanwhile merged.
  const reconcile = useCallback(
    async (change: ThemesChanged) => {
      const scan = await scanUserThemes(MANIFESTS);
      if (!scan) return; // listing failed: change nothing
      const prev = latest.current.userThemes;
      const id = shown.current.theme;
      const plan = planRescan(prev, scan, id, change);
      switch (plan.onScreen.kind) {
        case "keep":
        case "stale":
          return offer(plan.offer);
        case "gone": {
          // A pick under way moves off it anyway.
          if (active.current !== id) return offer(plan.offer);
          const next = defaultAppearance(MANIFESTS, DEFAULT_THEME, companion.current);
          active.current = next.theme;
          saveAppearance(window.localStorage, next);
          await sizeWindow(spanning(prev[id].manifest.window, MANIFESTS[next.theme].window), marginRef.current);
          if (active.current !== next.theme) return offer(plan.offer); // a pick came meanwhile; it wins
          // One render: the theme leaves the menu as the default takes the screen.
          setUserThemes(plan.offer);
          setAppearance(next);
          return;
        }
        case "reload": {
          const { theme } = plan.onScreen;
          const was = prev[id].manifest;
          let sheet: ThemeSheet;
          try {
            sheet = await loadThemeSheet(theme);
          } catch (err) {
            // Its CSS won't load (mid-write, say): it stays as it last loaded, until the next save.
            console.error("user theme failed to load", id, err);
            return offer(withTheme(plan.offer, id, prev[id]));
          }
          // Bigger now: the window grows first, so the new version isn't clipped; the effect above then fits it.
          const w = theme.manifest.window;
          if (w.width > was.window.width || w.height > was.window.height) await sizeWindow(spanning(was.window, w), marginRef.current);
          if (shown.current.theme !== id) {
            sheet.remove(); // moved off it meanwhile
            return offer(plan.offer);
          }
          const before = shown.current;
          const next = refreshAppearance(before, was, theme.manifest);
          // One frame: the new manifest rendered, the new CSS applied and the old CSS gone, all in this task.
          flushSync(() => {
            offer(plan.offer);
            setAppearance(next);
          });
          putSheet(id, sheet);
          if (next !== before) saveAppearance(window.localStorage, next);
          return;
        }
      }
    },
    [offer, putSheet, sizeWindow],
  );
  useEffect(() => {
    boot.changes.attach(oneAtATime(reconcile));
    return () => boot.changes.detach();
  }, [boot.changes, reconcile]);
  // The companion's own setting changes (on/off, or a species, palette or accessory from the picker, C6a, D2c), saved
  // at once.
  const setCompanion = useCallback((next: CompanionSetting) => {
    companion.current = next;
    setAppearance((a) => {
      const updated = { ...a, companion: next };
      saveAppearance(window.localStorage, updated);
      return updated;
    });
  }, []);
  // Installed once: it reads the themes at each right-click, so live reload (M3 L3) never reinstalls it, which would
  // strand a menu that's open at that moment.
  useEffect(
    () =>
      installThemeMenu(
        () => latest.current.manifests,
        () => active.current,
        pickTheme,
        {
          isOn: () => companion.current.on,
          toggle: () => setCompanion({ ...companion.current, on: !companion.current.on }),
          current: () => companion.current,
          pick: ({ skin, palette, accessory }) => setCompanion(pickCompanion(companion.current, skin, palette, accessory)),
        },
        // The gear picture (M3 L4): opens the settings window, or brings it forward.
        () => void invoke("open_settings", { title: copy("settingsTitle") }).catch((err) => console.error("settings window failed", err)),
      ),
    [pickTheme, setCompanion],
  );

  // Reset appearance (from the settings window): the default theme with nothing customised, the companion kept (your
  // call, M3 L4). Through the theme picker's own path when the theme changes, so the window sizing and a user theme's
  // sheet are handled as for any switch.
  const resetAppearance = useCallback(() => {
    if (active.current !== DEFAULT_THEME) return pickTheme(DEFAULT_THEME);
    const next = selectTheme(latest.current.manifests, DEFAULT_THEME, companion.current);
    saveAppearance(window.localStorage, next);
    setAppearance(next);
  }, [pickTheme]);
  // The settings window asks; this window owns the appearance and answers (src/settings/bridge.ts).
  useEffect(
    () => installPlayerBridge({ appearance: () => shown.current, setCompanion, reset: resetAppearance }),
    [setCompanion, resetAppearance],
  );
  useEffect(() => void publishAppearance(appearance), [appearance]);

  const dom = variantToDom(appearance.variant);
  return (
    <div className="app-stage" style={margin ? { padding: margin } : undefined}>
      <Player
        nowPlaying={nowPlaying}
        positionMs={positionMs}
        layout={appearance.variant.layout}
        theme={appearance.theme}
        overrides={dom.properties}
        hidden={appearance.variant.hidden}
        fx={{ ...manifests[appearance.theme].fx, ...dom.effects }}
        platform="windows"
        onPlayPause={() => store?.playPause()}
        onNext={() => store?.next()}
        onPrevious={() => store?.previous()}
        onVolume={(level) => store?.setVolume(level)}
        onLyrics={() => store?.showLyrics()}
        companion={appearance.companion.on ? { skin, palette: appearance.companion.palette, shelf: manifests[appearance.theme].companion?.shelf } : undefined}
      />
    </div>
  );
}

function App() {
  // The settings window (M3 L4) is this same page in a second window, told apart by its label.
  if (currentWindowLabel() === SETTINGS_LABEL) return <SettingsApp />;
  if (import.meta.env.DEV) {
    // esbuild inlines import.meta.env.DEV to `false` in production builds, which
    // makes this whole branch dead code — Rollup's tree-shaking then drops the
    // DevHarness import (and its /dev/fixtures dependency) from the bundle
    // entirely. Verified by scripts/check-fixtures-excluded.mjs, not just assumed.
    return <DevHarness />;
  }
  return <Production />;
}

/** Paints nothing (the window is transparent) until `boot` is done: one IPC call, plus a user theme's CSS if saved. */
function Production() {
  const [ready, setReady] = useState<Boot | null>(null);
  useEffect(() => {
    let live = true;
    void boot().then((b) => {
      if (live) return setReady(b);
      b.removeSheet?.();
      b.changes.stop();
    });
    return () => {
      live = false;
    };
  }, []);
  return ready ? <ProductionApp boot={ready} /> : null;
}

export default App;
