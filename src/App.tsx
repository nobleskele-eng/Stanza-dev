import "./App.css";
import "./theme/structure.css";
import "./theme/guard.css";
import "./fx/fx.css";
import "../themes/t1-default/theme.css";
import "../themes/t2-artwork/theme.css";
import "../themes/t3-pill/theme.css";
import "../themes/t4-extreme/theme.css";
import "../themes/t5-kinetic/theme.css";
import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { SKINS } from "./companion/registry";
import { artPixelPx, spriteBoxPx } from "./companion/pixel";
import { useDevicePixelRatio } from "./companion/useDevicePixelRatio";
import { SpotifyAdapter } from "./adapters/spotifyAdapter";
import { PlayerStore } from "./store/playerStore";
import { useInterpolatedPosition, useStoreSnapshot } from "./store/usePlayback";
import { loadAppearance, saveAppearance, selectTheme } from "./theme/appearance";
import { MANIFESTS } from "./theme/registry";
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

function ProductionApp() {
  const store = useSpotify();
  const nowPlaying = useStoreSnapshot(store);
  const positionMs = useInterpolatedPosition(nowPlaying);
  // The active theme + variant persist across restarts; right-click picks the theme (Slice 4).
  const [appearance, setAppearance] = useState(() => {
    const a = loadAppearance(window.localStorage, MANIFESTS);
    saveAppearance(window.localStorage, a); // normalises anything stale or invalid on disk
    return a;
  });
  const active = useRef(appearance.theme);
  const companion = useRef(appearance.companion);
  companion.current = appearance.companion;
  // Last size asked of the native window, so a switch that already grew it to the new size isn't repeated.
  const sizedTo = useRef("");
  // The companion (M2 C2b): off until turned on, kept across theme switches. On, the window grows by a margin on
  // top, the height of the pet's box, so it can stand on the card's top edge without the card moving on screen.
  const dpr = useDevicePixelRatio();
  const skin = SKINS[appearance.companion.skin];
  const margin = appearance.companion.on ? spriteBoxPx(skin.grid, artPixelPx(dpr)) : 0;
  const marginRef = useRef(margin);
  marginRef.current = margin;
  // The companion's top margin currently reflected in the window's position (it grows the window upward). It starts
  // at the launch margin, not 0: tauri-plugin-window-state restores the position saved at the last exit, which already
  // includes the margin if the companion was on, so shifting again would move the card up a margin on every launch.
  const shifted = useRef(margin);
  const sizeWindow = useCallback((size: { width: number; height: number }, margin: number) => {
    const height = size.height + margin;
    const key = `${size.width}x${height}`;
    const moveY = shifted.current - margin;
    if (key === sizedTo.current && !moveY) return Promise.resolve();
    sizedTo.current = key;
    shifted.current = margin;
    return fitWindowToTheme({ width: size.width, height }, moveY);
  }, []);
  // The native window takes the active theme's declared size. The player is centred side to side
  // and pinned to the top (.app-stage; docs/DECISIONS.md, Slice 6).
  useEffect(() => {
    void sizeWindow(MANIFESTS[appearance.theme].window, margin);
  }, [appearance.theme, margin, sizeWindow]);
  useEffect(() => installWindowDrag(), []);
  // Clicks pass through the transparent part of the window (docs/DECISIONS.md, Slice 3).
  useEffect(() => installHitRegion(), []);

  // Theme picker (Slice 4). Switching clears the old theme's overrides (selectTheme) and is saved at once.
  // The window first grows to fit both themes so neither is clipped while React swaps them; the effect
  // above then sets the new theme's exact size.
  const pickTheme = useCallback(
    (id: string) => {
      const from = active.current;
      if (id === from || !MANIFESTS[id]) return;
      active.current = id;
      const next = selectTheme(MANIFESTS, id, companion.current);
      saveAppearance(window.localStorage, next);
      const a = MANIFESTS[from].window;
      const b = MANIFESTS[id].window;
      void sizeWindow({ width: Math.max(a.width, b.width), height: Math.max(a.height, b.height) }, marginRef.current).then(() =>
        setAppearance(next),
      );
    },
    [sizeWindow],
  );
  const toggleCompanion = useCallback(() => {
    const next = { ...companion.current, on: !companion.current.on };
    companion.current = next;
    setAppearance((a) => {
      const updated = { ...a, companion: next };
      saveAppearance(window.localStorage, updated);
      return updated;
    });
  }, []);
  useEffect(
    () => installThemeMenu(MANIFESTS, () => active.current, pickTheme, { isOn: () => companion.current.on, toggle: toggleCompanion }),
    [pickTheme, toggleCompanion],
  );
  const dom = variantToDom(appearance.variant);
  return (
    <div className="app-stage" style={margin ? { paddingTop: margin } : undefined}>
      <Player
        nowPlaying={nowPlaying}
        positionMs={positionMs}
        layout={appearance.variant.layout}
        theme={appearance.theme}
        overrides={dom.properties}
        hidden={appearance.variant.hidden}
        fx={{ ...MANIFESTS[appearance.theme].fx, ...dom.effects }}
        platform="windows"
        onPlayPause={() => store?.playPause()}
        onNext={() => store?.next()}
        onPrevious={() => store?.previous()}
        onVolume={(level) => store?.setVolume(level)}
        onLyrics={() => store?.showLyrics()}
        companion={appearance.companion.on ? { skin, palette: appearance.companion.palette } : undefined}
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
  return <ProductionApp />;
}

export default App;
