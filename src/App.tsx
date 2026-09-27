import "./App.css";
import "./theme/structure.css";
import "./theme/guard.css";
import "./fx/fx.css";
import "../themes/t1-default/theme.css";
import "../themes/t2-artwork/theme.css";
import "../themes/t3-pill/theme.css";
import "../themes/t4-extreme/theme.css";
import "../themes/t5-kinetic/theme.css";
import { useEffect, useState } from "react";
import { loadAppearance, saveAppearance } from "./theme/appearance";
import { MANIFESTS } from "./theme/registry";
import { variantToDom } from "./theme/variant";
import { DevHarness } from "./dev/DevHarness";
import { Player } from "./player/Player";
import { IDLE_NOW_PLAYING } from "./types/player";
import { fitWindowToTheme, installHitRegion, installWindowDrag } from "./window/nativeWindow";

function ProductionPlaceholder() {
  // Real Spotify/GSMTC adapter wiring is a later phase (docs/PLAN.md Phase 5+ /
  // the stranded spike/s2-gsmtc branch). The theme/DOM contract itself is done
  // (Phase 3) — rendered here idle, with no adapter feeding it yet.
  // The active theme + variant persist across restarts (no picker UI yet: Phase 4).
  const [appearance] = useState(() => {
    const a = loadAppearance(window.localStorage, MANIFESTS);
    saveAppearance(window.localStorage, a); // normalises anything stale or invalid on disk
    return a;
  });
  // The native window takes the active theme's declared size; the player sits at its top-left,
  // as in the harness and every e2e check (docs/DECISIONS.md, Slice 2).
  useEffect(() => fitWindowToTheme(MANIFESTS[appearance.theme].window), [appearance.theme]);
  useEffect(() => installWindowDrag(), []);
  // Clicks pass through the transparent part of the window (docs/DECISIONS.md, Slice 3).
  useEffect(() => installHitRegion(), []);
  const dom = variantToDom(appearance.variant);
  return (
    <Player
      nowPlaying={IDLE_NOW_PLAYING}
      positionMs={0}
      layout={appearance.variant.layout}
      theme={appearance.theme}
      overrides={dom.properties}
      hidden={appearance.variant.hidden}
      fx={{ ...MANIFESTS[appearance.theme].fx, ...dom.effects }}
      platform="windows"
    />
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
  return <ProductionPlaceholder />;
}

export default App;
