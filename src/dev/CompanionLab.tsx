// Dev-only Companion lab (`?lab=companion`, PLAN.md §4b/§5 M2 C1): every skin × palette × animation,
// playing on light and dark backdrops, at the real size and zoomed, plus each animation's frames side by
// side. Where the D1 design round shows creature concepts. Never in production (DevHarness is DEV-only).
// `?pause` holds every animation on its first frame (screenshots, crispness checks).
import type { CSSProperties } from "react";
import { SKINS } from "../companion/registry";
import { LAYOUT_GRID } from "../companion/pixel";
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

export function CompanionLab() {
  const params = new URLSearchParams(window.location.search);
  const paused = params.has("pause");
  const only = params.get("skin");
  return (
    <div style={{ padding: 16, fontFamily: "ui-monospace, monospace", fontSize: 11, background: "#fff", color: "#111" }}>
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
