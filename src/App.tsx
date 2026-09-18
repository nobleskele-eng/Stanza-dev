import "./App.css";
import { DevHarness } from "./dev/DevHarness";

function ProductionPlaceholder() {
  // Real Spotify/GSMTC adapter wiring and the theme system are later phases
  // (docs/PLAN.md Phase 3/4). Phase 2 only needs PlayerStore + the mock adapter
  // to exist and be tested — see src/dev/DevHarness.tsx for the browser dev loop.
  return (
    <main className="container">
      <p>Stanza — no adapter wired yet (Phase 2 scope).</p>
    </main>
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
