import { useEffect, useState } from "react";
import { MockAdapter } from "../adapters/mockAdapter";
import { Player, type Layout } from "../player/Player";
import { PlayerStore, interpolatePositionMs } from "../store/playerStore";
import type { NowPlaying } from "../types/player";

// Dev-only UI for exercising PlayerStore against fixture data in a normal browser
// (docs/PLAN.md §4). The only place in src/ allowed to reach into /dev/fixtures,
// and only ever mounted behind `import.meta.env.DEV` (see App.tsx) so this whole
// module — and the fixture strings it pulls in — has no reachable import path from
// the production entry point. Verified by scripts/check-fixtures-excluded.mjs.

type FixtureMap = Record<string, NowPlaying>;

export function DevHarness() {
  const [fixtures, setFixtures] = useState<FixtureMap | null>(null);
  const [store] = useState(() => new PlayerStore());
  const [adapter] = useState(() => new MockAdapter("spotify", { source: "spotify", status: "idle", positionMs: 0, positionUpdatedAt: Date.now(), caps: { seek: false, volume: false, shuffle: false, repeat: false, album: false } }));
  const [snapshot, setSnapshot] = useState<NowPlaying>(store.getSnapshot());
  const [now, setNow] = useState(Date.now());
  const [layout, setLayout] = useState<Layout>("strip");

  useEffect(() => {
    import("../../dev/fixtures/nowPlaying").then((mod) => setFixtures(mod.fixtures));
  }, []);

  useEffect(() => {
    store.registerAdapter(adapter);
    store.switchSource("spotify");
    return store.subscribe(setSnapshot);
  }, [store, adapter]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  if (!fixtures) return <p>loading fixtures…</p>;

  const positionMs = interpolatePositionMs(snapshot, now);

  return (
    <main style={{ padding: 24, fontFamily: "monospace" }}>
      <h1>PlayerStore dev harness</h1>
      <p>Mock adapter + fixtures only — real Spotify/GSMTC wiring isn't part of Phase 2.</p>

      <fieldset>
        <legend>fixture</legend>
        {Object.keys(fixtures).map((key) => (
          <label key={key} style={{ display: "block" }}>
            <input
              type="radio"
              name="fixture"
              onChange={() => adapter.setState(fixtures[key])}
            />
            {key}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>layout</legend>
        {(["strip", "pill", "card"] as const).map((l) => (
          <label key={l} style={{ marginRight: 12 }}>
            <input type="radio" name="layout" checked={layout === l} onChange={() => setLayout(l)} />
            {l}
          </label>
        ))}
      </fieldset>

      <button onClick={() => store.playPause()}>play/pause</button>

      <div style={{ margin: "20px 0" }}>
        <Player nowPlaying={snapshot} positionMs={positionMs} layout={layout} platform="windows" />
      </div>

      <pre>{JSON.stringify({ ...snapshot, interpolatedPositionMs: positionMs }, null, 2)}</pre>
    </main>
  );
}
