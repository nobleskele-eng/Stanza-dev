import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

interface Caps {
  play_pause: boolean;
  next: boolean;
  previous: boolean;
  seek: boolean;
  shuffle: boolean | null;
  repeat: string | null;
}

interface NowPlayingSnapshot {
  found: boolean;
  aumid: string;
  status: string;
  title: string;
  artist: string;
  album: string;
  thumbnail: string | null;
  position_ms: number;
  duration_ms: number;
  updated_at_ms: number;
  caps: Caps;
}

function App() {
  const [snap, setSnap] = useState<NowPlayingSnapshot | null>(null);
  const [changeCount, setChangeCount] = useState(0);
  const lastTrackKey = useRef<string | null>(null);

  useEffect(() => {
    invoke<NowPlayingSnapshot>("gsmtc_snapshot").then(setSnap).catch(console.error);
    const unlisten = listen<NowPlayingSnapshot>("gsmtc:now-playing", (event) => {
      const s = event.payload;
      setSnap(s);
      const key = `${s.title}::${s.artist}`;
      if (s.title && key !== lastTrackKey.current) {
        lastTrackKey.current = key;
        setChangeCount((c) => c + 1);
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  return (
    <div className="mp-root">
      <div className="mp-window mp-window--spike">
        <div className="mp-meta">
          <div className="mp-title">S2 GSMTC spike — track changes: {changeCount}</div>
          <div className="mp-artist">
            {snap?.found ? `${snap.title} — ${snap.artist}` : "no Spotify session found"}
          </div>
          <pre data-no-drag className="mp-debug">
            {JSON.stringify(snap, null, 2)}
          </pre>
          <div className="mp-controls" data-no-drag>
            <button onClick={() => invoke("gsmtc_previous")}>⏮</button>
            <button onClick={() => invoke("gsmtc_play_pause")}>⏵/⏸</button>
            <button onClick={() => invoke("gsmtc_next")}>⏭</button>
            <button
              onClick={() =>
                snap && invoke("gsmtc_seek", { positionMs: snap.position_ms + 10000 })
              }
            >
              +10s
            </button>
            <button onClick={() => invoke("gsmtc_toggle_shuffle")}>shuffle</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
