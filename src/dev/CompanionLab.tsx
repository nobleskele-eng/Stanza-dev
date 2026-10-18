// Dev-only Companion lab (`?lab=companion`, PLAN.md §4b/§5 M2 C1): every skin × palette × animation,
// playing on light and dark backdrops, at the real size and zoomed, plus each animation's frames side by
// side. Where the D1 design round shows creature concepts. Never in production (DevHarness is DEV-only).
// `?pause` holds every animation on its first frame (screenshots, crispness checks).
import type { CSSProperties } from "react";
import { SKINS } from "../companion/registry";
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

/**
 * Lab-only: the row of the `sit` pose that rests on the edge (its shins hang below it). Format v1 has one anchor,
 * the standing foot point; `hang` and `climb` contacts can be read off the art, but `sit` can't. Whether animations
 * get their own anchor is C3's call (docs/COMPANION.md).
 */
const SIT_ROW: Record<string, number> = { "test-dummy": 14, pilcrow: 10, bookworm: 10, cassette: 11 };

const SCENE = { w: 352, h: 200, card: { x: 56, y: 56, w: 248, h: 88 } } as const;
const CARD = {
  light: { face: "#ffffff", edge: "#d9d5cb", art: "#dcd6c9", bar: "#e7e3da" },
  dark: { face: "#24242b", edge: "#35353e", art: "#3a3a45", bar: "#32323b" },
} as const;

/**
 * The creature around a plain mock card at real size: walking, sitting and asleep on the top edge, hanging under the
 * bottom edge (the owner's sketch), climbing the left side. The card has no text (CLAUDE.md: no generated copy).
 * Sprites sit at the grid-aligned scene origin and move only by `transform`, whole device px: the C2 placement rule.
 */
function Scene({ skin, palette, backdrop, paused }: { skin: Skin; palette: string; backdrop: keyof typeof BACKDROPS; paused: boolean }) {
  const dpr = window.devicePixelRatio || 1;
  const px = artPixelPx(dpr);
  const snap = (v: number) => Math.round(v * dpr) / dpr;
  const { card } = SCENE;
  const { anchor } = skin;
  const stand = (x: number) => ({ x: card.x + x - anchor.x * px, y: card.y - (anchor.y + 1) * px });
  const hangTop = opaqueBox(skin.animations.hang.frames[0]).y0;
  const climbRight = opaqueBox(skin.animations.climb.frames[0]).x1;
  const poses: { animation: AnimationName; at: { x: number; y: number } }[] = [
    { animation: "walk", at: stand(40) },
    { animation: "sleep", at: stand(112) },
    { animation: "sit", at: { x: card.x + 184 - anchor.x * px, y: card.y - ((SIT_ROW[skin.id] ?? anchor.y) + 1) * px } },
    { animation: "hang", at: { x: card.x + 132 - anchor.x * px, y: card.y + card.h - hangTop * px } },
    { animation: "climb", at: { x: card.x - (climbRight + 1) * px, y: card.y + 20 } },
  ];
  const c = CARD[backdrop];
  return (
    <div data-lab-scene={backdrop} style={{ position: "relative", width: SCENE.w, height: SCENE.h, background: BACKDROPS[backdrop], overflow: "hidden" }}>
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
      {poses.map(({ animation, at }) => (
        <div key={animation} data-lab-pose={animation} style={{ position: "absolute", left: 0, top: 0, transform: `translate(${snap(at.x)}px, ${snap(at.y)}px)` }}>
          <Playing skin={skin} animation={animation} palette={palette} paused={paused} />
        </div>
      ))}
    </div>
  );
}

export function CompanionLab() {
  const params = new URLSearchParams(window.location.search);
  const paused = params.has("pause");
  const only = params.get("skin");
  return (
    <div style={{ padding: 16, fontFamily: "ui-monospace, monospace", fontSize: 11, background: "#fff", color: "#111" }}>
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
