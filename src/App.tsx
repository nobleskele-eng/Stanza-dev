import "./theme/shell.css";
import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dress } from "./companion/accessory";
import { SKINS } from "./companion/registry";
import { artPixelPx, spriteBoxPx } from "./companion/pixel";
import { useDevicePixelRatio } from "./companion/useDevicePixelRatio";
import { SpotifyAdapter } from "./adapters/spotifyAdapter";
import { PlayerStore } from "./store/playerStore";
import { useInterpolatedPosition, useStoreSnapshot } from "./store/usePlayback";
import {
  defaultAppearance,
  loadAppearance,
  pickCompanion,
  saveAppearance,
  selectTheme,
  type Appearance,
  type CompanionSetting,
} from "./theme/appearance";
import { DEFAULT_THEME, MANIFESTS } from "./theme/registry";
import { loadThemeSheet, loadUserThemes, type UserTheme } from "./theme/userThemes";
import { variantToDom, type ThemeManifest } from "./theme/variant";
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

/** What the player starts from: every theme it can offer, and the saved appearance, its user theme's CSS loaded. */
interface Boot {
  /** The five bundled themes, then the user themes (M3 L2). Fixed for the run. */
  manifests: Record<string, ThemeManifest>;
  userThemes: Record<string, UserTheme>;
  appearance: Appearance;
  /** Removes the active user theme's sheet, if the saved theme is one. */
  removeSheet: (() => void) | null;
}

/**
 * Before the first paint: find the user themes, so a saved user theme isn't mistaken for an unknown one (and reset to
 * the default), then load its CSS, so it never paints unstyled. A user theme whose CSS fails to load is dropped for
 * the run and the default theme takes its place. Outside Tauri there are no user themes.
 */
async function boot(): Promise<Boot> {
  const userThemes = await loadUserThemes(MANIFESTS);
  const manifests: Record<string, ThemeManifest> = { ...MANIFESTS };
  for (const [id, t] of Object.entries(userThemes)) manifests[id] = t.manifest;
  let appearance = loadAppearance(window.localStorage, manifests);
  let removeSheet: (() => void) | null = null;
  const user = userThemes[appearance.theme];
  if (user) {
    try {
      removeSheet = await loadThemeSheet(user);
    } catch (err) {
      console.error("user theme failed to load", appearance.theme, err);
      delete userThemes[appearance.theme];
      delete manifests[appearance.theme];
      appearance = defaultAppearance(manifests, DEFAULT_THEME, appearance.companion);
    }
  }
  saveAppearance(window.localStorage, appearance); // normalises anything stale or invalid on disk
  return { manifests, userThemes, appearance, removeSheet };
}

function ProductionApp({ boot }: { boot: Boot }) {
  const { manifests, userThemes } = boot;
  const store = useSpotify();
  const nowPlaying = useStoreSnapshot(store);
  const positionMs = useInterpolatedPosition(nowPlaying);
  // The active theme + variant persist across restarts; right-click picks the theme (Slice 4).
  const [appearance, setAppearance] = useState(boot.appearance);
  // Loaded user-theme sheets by theme id. Only the active theme's is kept, removed once another theme has rendered.
  const sheets = useRef(new Map<string, () => void>(boot.removeSheet ? [[boot.appearance.theme, boot.removeSheet]] : []));
  useEffect(() => {
    for (const [id, remove] of sheets.current)
      if (id !== appearance.theme) {
        remove();
        sheets.current.delete(id);
      }
  }, [appearance.theme]);
  const active = useRef(appearance.theme);
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
  // unstyled; if it fails, nothing changes. A newer pick made while it loaded wins.
  const pickTheme = useCallback(
    (id: string) => {
      const from = active.current;
      if (id === from || !manifests[id]) return;
      active.current = id;
      const user = userThemes[id];
      const ready =
        user && !sheets.current.has(id) ? loadThemeSheet(user).then((remove) => void sheets.current.set(id, remove)) : Promise.resolve();
      ready
        .then(() => {
          if (active.current !== id) return; // picked something else meanwhile; the effect above tidies the sheet
          const next = selectTheme(manifests, id, companion.current);
          saveAppearance(window.localStorage, next);
          const a = manifests[from].window;
          const b = manifests[id].window;
          return sizeWindow({ width: Math.max(a.width, b.width), height: Math.max(a.height, b.height) }, marginRef.current).then(() =>
            setAppearance(next),
          );
        })
        .catch((err) => {
          console.error("user theme failed to load", id, err);
          if (active.current === id) active.current = from;
        });
    },
    [manifests, userThemes, sizeWindow],
  );
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
  useEffect(
    () =>
      installThemeMenu(manifests, () => active.current, pickTheme, {
        isOn: () => companion.current.on,
        toggle: () => setCompanion({ ...companion.current, on: !companion.current.on }),
        current: () => companion.current,
        pick: ({ skin, palette, accessory }) => setCompanion(pickCompanion(companion.current, skin, palette, accessory)),
      }),
    [manifests, pickTheme, setCompanion],
  );
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
    void boot().then((b) => (live ? setReady(b) : b.removeSheet?.()));
    return () => {
      live = false;
    };
  }, []);
  return ready ? <ProductionApp boot={ready} /> : null;
}

export default App;
