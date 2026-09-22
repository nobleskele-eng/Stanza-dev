import "./App.css";
import "./theme/structure.css";
import "./theme/guard.css";
import "../themes/t1-default/theme.css";
import "../themes/t2-artwork/theme.css";
import "../themes/t3-pill/theme.css";
import { DevHarness } from "./dev/DevHarness";
import { Player } from "./player/Player";
import { IDLE_NOW_PLAYING } from "./types/player";

function ProductionPlaceholder() {
  // Real Spotify/GSMTC adapter wiring is a later phase (docs/PLAN.md Phase 5+ /
  // the stranded spike/s2-gsmtc branch). The theme/DOM contract itself is done
  // (Phase 3) — rendered here idle, with no adapter feeding it yet.
  return <Player nowPlaying={IDLE_NOW_PLAYING} positionMs={0} layout="strip" platform="windows" />;
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
