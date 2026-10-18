// Dev-only Companion lab (`?lab=companion`, PLAN.md §4b/§5 M2): the creatures living on mock cards, run by their
// brain (C2); each one around a card in every pose (D1); and every skin × palette × animation on light and dark
// backdrops, at the real size and zoomed, plus each animation's frames side by side (C1). Never in production
// (DevHarness is DEV-only). `?pause` holds every animation on its first frame (screenshots, crispness checks);
// `?skin=<id>` shows one skin and leaves out the live cards; `?live` shows only the live cards.
import { useState, type CSSProperties, type ReactNode } from "react";
import { Companion } from "../companion/Companion";
import { placeOnEdge } from "../companion/place";
import { SKINS } from "../companion/registry";
import { hashString } from "../fx/beat";
import { LAYOUT_GRID, artPixelPx } from "../companion/pixel";
import { REQUIRED_ANIMATIONS, type AnimationName, type Skin } from "../companion/skin";
import { Sprite, useFrame } from "../companion/Sprite";

const BACKDROPS = { light: "#f2f0ea", dark: "#16161a" } as const;

/**
 * Every length on this page is a multiple of LAYOUT_GRID (pixel.ts), so each sprite's box starts on a device pixel
 * without any runtime nudging. Measured nudges failed: docs/DECISIONS.md 2026-10-18, M2 C1.
 */
/** CSS px per art pixel in the zoomed view: whole device px at every quarter-step scaling (8/10/12/14/16). */
const ZOOM_PIXEL = 8;
const LINE: CSSProperties = { lineHeight: `${LAYOUT_GRID * 4}px`, margin: 0 };

function Playing({ skin, animation, palette, pixel, paused }: { skin: Skin; animation: AnimationName; palette: string; pixel?: number; paused: boolean }) {
  const frame = useFrame(skin.animations[animation], !paused);
  return <Sprite skin={skin} animation={animation} frame={frame} palette={palette} pixel={pixel} />;
}

/** The opaque box of a frame, in art pixels. */
function opaqueBox(rows: readonly string[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++)
      if (r[x] !== ".") {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  });
  return { x0, y0, x1, y1 };
}

const SCENE = { w: 352, h: 200, card: { x: 56, y: 56, w: 248, h: 88 } } as const;
const CARD = {
  light: { face: "#ffffff", edge: "#d9d5cb", art: "#dcd6c9", bar: "#e7e3da" },
  dark: { face: "#24242b", edge: "#35353e", art: "#3a3a45", bar: "#32323b" },
} as const;
const TOP_EDGE = { left: SCENE.card.x, top: SCENE.card.y, width: SCENE.card.w };

/** A plain mock card on a backdrop, the scene's size; no text (CLAUDE.md: no generated copy). */
function MockCard({ backdrop, children, ...data }: { backdrop: keyof typeof BACKDROPS; children: ReactNode } & Record<`data-${string}`, string>) {
  const { card } = SCENE;
  const c = CARD[backdrop];
  return (
    <div {...data} style={{ position: "relative", width: SCENE.w, height: SCENE.h, background: BACKDROPS[backdrop], overflow: "hidden" }}>
      <div style={{ position: "absolute", left: card.x, top: card.y, width: card.w, height: card.h, boxSizing: "border-box", background: c.face, border: `1px solid ${c.edge}`, borderRadius: 12 }}>
        <div style={{ position: "absolute", left: 12, top: 12, width: 64, height: 64, borderRadius: 4, background: c.art }} />
        {[
          [20, 120],
          [36, 84],
          [60, 136],
        ].map(([top, width]) => (
          <div key={top} style={{ position: "absolute", left: 88, top, width, height: 8, borderRadius: 4, background: c.bar }} />
        ))}
      </div>
      {children}
    </div>
  );
}

/**
 * The creature around the mock card at real size: walking, sitting and asleep on the top edge, hanging under the
 * bottom edge (the owner's sketch), climbing the left side. Sprites sit at the grid-aligned scene origin and move only
 * by `transform`, whole device px: the C2 placement rule. Top-edge poses use the production placement (place.ts);
 * `hang` and `climb` contacts are read off the art until C3 defines them.
 */
function Scene({ skin, palette, backdrop, paused }: { skin: Skin; palette: string; backdrop: keyof typeof BACKDROPS; paused: boolean }) {
  const dpr = window.devicePixelRatio || 1;
  const px = artPixelPx(dpr);
  const snap = (v: number) => Math.round(v * dpr) / dpr;
  const { card } = SCENE;
  const onTop = (animation: AnimationName, at: number) => {
    const { left, top } = placeOnEdge(skin, animation, Math.round(at / px), 1, px, TOP_EDGE);
    return { x: left, y: top };
  };
  const hangTop = opaqueBox(skin.animations.hang.frames[0]).y0;
  const climbRight = opaqueBox(skin.animations.climb.frames[0]).x1;
  const poses: { animation: AnimationName; at: { x: number; y: number } }[] = [
    { animation: "walk", at: onTop("walk", 40) },
    { animation: "sleep", at: onTop("sleep", 112) },
    { animation: "sit", at: onTop("sit", 184) },
    { animation: "hang", at: { x: card.x + 132 - skin.anchor.x * px, y: card.y + card.h - hangTop * px } },
    { animation: "climb", at: { x: card.x - (climbRight + 1) * px, y: card.y + 20 } },
  ];
  return (
    <MockCard backdrop={backdrop} data-lab-scene={backdrop}>
      {poses.map(({ animation, at }) => (
        <div key={animation} data-lab-pose={animation} style={{ position: "absolute", left: 0, top: 0, transform: `translate(${snap(at.x)}px, ${snap(at.y)}px)` }}>
          <Playing skin={skin} animation={animation} palette={palette} paused={paused} />
        </div>
      ))}
    </MockCard>
  );
}

type Playback = "playing" | "paused" | "idle";

/**
 * Each creature living on a mock card's top edge, run by its brain (M2 C2): the controls stand in for the music.
 * Lab-only labels; the production player's text comes from COPY.md.
 */
function Live() {
  const [playback, setPlayback] = useState<Playback>("playing");
  const [track, setTrack] = useState(0);
  const controls: [string, () => void][] = [
    ["play", () => setPlayback("playing")],
    ["pause", () => setPlayback("paused")],
    ["stop", () => setPlayback("idle")],
    ["next track", () => setTrack((t) => t + 1)],
  ];
  return (
    <section data-lab-live="" data-lab-playback={playback} style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {controls.map(([label, act]) => (
          <button key={label} type="button" data-lab-control={label} onClick={act} style={{ font: "inherit", height: 24 }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {Object.values(SKINS).map((skin) => (
          <MockCard key={skin.id} backdrop="light" data-lab-live-skin={skin.id}>
            <Companion skin={skin} playing={playback === "playing"} trackKey={String(track)} edge={TOP_EDGE} seed={hashString(skin.id)} />
          </MockCard>
        ))}
      </div>
    </section>
  );
}

export function CompanionLab() {
  const params = new URLSearchParams(window.location.search);
  const paused = params.has("pause");
  const only = params.get("skin");
  const page: CSSProperties = { padding: 16, fontFamily: "ui-monospace, monospace", fontSize: 11, background: "#fff", color: "#111" };
  // Only the live cards: the gallery's ~570 animated sprites would drown them under a fake clock (DECISIONS.md, C2a).
  if (params.has("live"))
    return (
      <div style={page}>
        <Live />
      </div>
    );
  return (
    <div style={page}>
      {!only && <Live />}
      <section data-lab-scenes="" style={{ marginBottom: 24 }}>
        {Object.values(SKINS)
          .filter((s) => !only || s.id === only)
          .map((skin) => (
            <div key={skin.id} data-lab-skin={skin.id} style={{ marginBottom: 12 }}>
              <h2 style={{ ...LINE, fontSize: 13, marginBottom: 8 }}>{skin.id}</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                <Scene skin={skin} palette="default" backdrop="light" paused={paused} />
                <Scene skin={skin} palette="default" backdrop="dark" paused={paused} />
              </div>
            </div>
          ))}
      </section>
      {Object.values(SKINS)
        .filter((s) => !only || s.id === only)
        .map((skin) =>
          Object.keys(skin.palettes).map((palette) => (
            <section key={`${skin.id}/${palette}`} data-lab-skin={skin.id} data-lab-palette={palette} style={{ marginBottom: 24 }}>
              <h2 style={{ ...LINE, fontSize: 13, marginBottom: 8 }}>
                {skin.id} / {palette}
              </h2>
              {(Object.keys(BACKDROPS) as (keyof typeof BACKDROPS)[]).map((backdrop) => (
                <div key={backdrop} style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: 12, background: BACKDROPS[backdrop], color: backdrop === "dark" ? "#ddd" : "#333" }}>
                  {REQUIRED_ANIMATIONS.map((animation) => (
                    <figure key={animation} data-lab-anim={animation} data-lab-backdrop={backdrop} style={{ margin: 0, width: skin.grid * ZOOM_PIXEL, display: "grid", gap: LAYOUT_GRID }}>
                      <div data-lab-sprite="">
                        <Playing skin={skin} animation={animation} palette={palette} paused={paused} />
                      </div>
                      <Playing skin={skin} animation={animation} palette={palette} pixel={ZOOM_PIXEL} paused={paused} />
                      <figcaption style={LINE}>{animation}</figcaption>
                    </figure>
                  ))}
                </div>
              ))}
              <div style={{ padding: 12, display: "flex", flexWrap: "wrap", gap: 16 }}>
                {REQUIRED_ANIMATIONS.map((animation) => (
                  <div key={animation} data-lab-strip={animation} style={{ display: "flex", gap: 2, alignItems: "end" }}>
                    {skin.animations[animation].frames.map((_, f) => (
                      <Sprite key={f} skin={skin} animation={animation} frame={f} palette={palette} />
                    ))}
                    <span style={{ marginLeft: 4 }}>{animation}</span>
                  </div>
                ))}
              </div>
            </section>
          )),
        )}
    </div>
  );
}
