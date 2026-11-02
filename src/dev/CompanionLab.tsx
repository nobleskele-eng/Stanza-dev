// Dev-only Companion lab (`?lab=companion`, PLAN.md §4b/§5 M2): the creatures living on mock cards, run by their
// brain (C2), on the top edge, around the whole card (C3a) and on a shelf inside a taller card (C5a), and taking the
// pointer (C4a: click, pick up, drop); each one around a card in every pose (D1); and every
// skin × palette × animation on light and dark backdrops, at the real size and zoomed, plus each animation's frames
// side by side (C1). Never in production (DevHarness is DEV-only). `?pause` holds every animation on its first frame
// (screenshots, crispness checks); `?skin=<id>` shows one skin and leaves out the live cards; `?live` shows only the
// top-edge live cards, `?around` only the ones that travel the outline, `?shelf` only the ones with a shelf.
import { useState, type CSSProperties, type ReactNode } from "react";
import { Companion } from "../companion/Companion";
import { measureShelf, type Box } from "../companion/measure";
import { placeAround, type EdgeBox, type Surface } from "../companion/place";
import { SKINS } from "../companion/registry";
import { hashString } from "../fx/beat";
import { LAYOUT_GRID, artPixelPx } from "../companion/pixel";
import { OPTIONAL_ANIMATIONS, REQUIRED_ANIMATIONS, animationOf, type AnimationName, type Skin } from "../companion/skin";

/** Every animation a skin has: the required ones, then any corner poses (C3c). */
const animationsOf = (skin: Skin): AnimationName[] => [...REQUIRED_ANIMATIONS, ...OPTIONAL_ANIMATIONS.filter((a) => skin.animations[a])];
import { Sprite, useFrame } from "../companion/Sprite";

const BACKDROPS = { light: "#f2f0ea", dark: "#16161a" } as const;

/**
 * Every length on this page is a multiple of LAYOUT_GRID (pixel.ts), so each sprite's box starts on a device pixel
 * without any runtime nudging. Measured nudges failed: docs/DECISIONS.md 2026-10-18, M2 C1.
 */
/** CSS px per art pixel in the zoomed view: whole device px at every quarter-step scaling (8/10/12/14/16). */
const ZOOM_PIXEL = 8;
const LINE: CSSProperties = { lineHeight: `${LAYOUT_GRID * 4}px`, margin: 0 };

function Playing({
  skin,
  animation,
  palette,
  pixel,
  paused,
  mirrored = false,
}: {
  skin: Skin;
  animation: AnimationName;
  palette: string;
  pixel?: number;
  paused: boolean;
  mirrored?: boolean;
}) {
  const frame = useFrame(animationOf(skin, animation), !paused);
  return <Sprite skin={skin} animation={animation} frame={frame} palette={palette} pixel={pixel} mirrored={mirrored} />;
}

const SCENE = { w: 352, h: 200, card: { x: 56, y: 56, w: 248, h: 88 } } as const;
const CARD = {
  light: { face: "#ffffff", edge: "#d9d5cb", art: "#dcd6c9", bar: "#e7e3da" },
  dark: { face: "#24242b", edge: "#35353e", art: "#3a3a45", bar: "#32323b" },
} as const;
const TOP_EDGE = { left: SCENE.card.x, top: SCENE.card.y, width: SCENE.card.w };
/** The card's whole box: the scene leaves 56 px around it, more than any sprite's box. */
const OUTLINE = { left: SCENE.card.x, top: SCENE.card.y, width: SCENE.card.w, height: SCENE.card.h };
/** The mock artwork square, in the card's padding box (inside its 1 px border). */
const ART = { x: 12, y: 12, size: 64 } as const;
/** The artwork in the scene's px: what a carried or falling creature never covers (C4a). */
const ART_BOX = { left: SCENE.card.x + 1 + ART.x, top: SCENE.card.y + 1 + ART.y, width: ART.size, height: ART.size };
/** The mock text bars, in the card's padding box: [top, width], each 8 px high from 88 px in. */
const BARS = [
  [20, 120],
  [36, 84],
  [60, 136],
] as const;

/**
 * The shelf cards (C5a): the same card, taller, with a mock source badge at its foot and a shelf from the left side
 * to beside the badge, level with its foot. The shelf is drawn here only to show where it is; whether a theme draws
 * one is C5b's question. Scene px.
 */
const SHELF_SCENE = { w: 352, h: 264, card: { x: 56, y: 56, w: 248, h: 152 } } as const;
const SHELF_OUTLINE = { left: SHELF_SCENE.card.x, top: SHELF_SCENE.card.y, width: SHELF_SCENE.card.w, height: SHELF_SCENE.card.h };
const SHELF_TOP_EDGE = { left: SHELF_OUTLINE.left, top: SHELF_OUTLINE.top, width: SHELF_OUTLINE.width };
const BADGE_BOX = { left: 160, top: 172, width: 40, height: 20 };
/** Declared a little past the badge's left side, so `measureShelf` has to trim its end. */
const SHELF_LINE: EdgeBox = { left: SHELF_OUTLINE.left, top: BADGE_BOX.top + BADGE_BOX.height, width: 112 };
/** Every part on the shelf card, scene px: no floor pose on the shelf may cover one. */
const SHELF_PARTS: Box[] = [
  ART_BOX,
  ...BARS.map(([top, width]) => ({ left: SHELF_SCENE.card.x + 1 + 88, top: SHELF_SCENE.card.y + 1 + top, width, height: 8 })),
  BADGE_BOX,
].map((b) => ({ left: b.left, top: b.top, right: b.left + b.width, bottom: b.top + b.height }));

/** A plain mock card on a backdrop, the scene's size; no text (CLAUDE.md: no generated copy). */
function MockCard({
  backdrop,
  shelf = false,
  children,
  ...data
}: { backdrop: keyof typeof BACKDROPS; shelf?: boolean; children: ReactNode } & Record<`data-${string}`, string>) {
  const scene = shelf ? SHELF_SCENE : SCENE;
  const { card } = scene;
  const c = CARD[backdrop];
  // The shelf card's extras are placed in scene px; inside the card that's 1 px less (its border).
  const inCard = (b: { left: number; top: number }) => ({ left: b.left - card.x - 1, top: b.top - card.y - 1 });
  return (
    <div {...data} style={{ position: "relative", width: scene.w, height: scene.h, background: BACKDROPS[backdrop], overflow: "hidden" }}>
      <div style={{ position: "absolute", left: card.x, top: card.y, width: card.w, height: card.h, boxSizing: "border-box", background: c.face, border: `1px solid ${c.edge}`, borderRadius: 12 }}>
        <div data-lab-art="" style={{ position: "absolute", left: ART.x, top: ART.y, width: ART.size, height: ART.size, borderRadius: 4, background: c.art }} />
        {BARS.map(([top, width]) => (
          <div key={top} data-lab-bar="" style={{ position: "absolute", left: 88, top, width, height: 8, borderRadius: 4, background: c.bar }} />
        ))}
        {shelf && (
          <>
            <div data-lab-badge="" style={{ position: "absolute", ...inCard(BADGE_BOX), width: BADGE_BOX.width, height: BADGE_BOX.height, borderRadius: 10, background: c.bar }} />
            <div data-lab-shelf-line="" style={{ position: "absolute", ...inCard(SHELF_LINE), width: SHELF_LINE.width, height: 2, background: c.edge }} />
          </>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * The creature around the mock card at real size: walking, sitting and asleep on the top edge, hanging under the
 * bottom edge (the owner's sketch), climbing the left side, and rounding the right-hand corners (C3c). Sprites sit at the grid-aligned scene origin and move only
 * by `transform`, whole device px: the C2 placement rule. Every pose uses the brain's placement (place.ts), at a
 * position given in CSS px along its surface.
 */
function Scene({ skin, palette, backdrop, paused }: { skin: Skin; palette: string; backdrop: keyof typeof BACKDROPS; paused: boolean }) {
  const dpr = window.devicePixelRatio || 1;
  const px = artPixelPx(dpr);
  const snap = (v: number) => Math.round(v * dpr) / dpr;
  const at = (animation: AnimationName, surface: Surface, along: number) => {
    const { left, top, mirrored } = placeAround(skin, animation, surface, Math.round(along / px), 1, px, TOP_EDGE, OUTLINE);
    return { x: left, y: top, mirrored };
  };
  const poses: { animation: AnimationName; at: { x: number; y: number; mirrored: boolean } }[] = [
    { animation: "walk", at: at("walk", "top", 40) },
    { animation: "sleep", at: at("sleep", "top", 112) },
    { animation: "sit", at: at("sit", "top", 184) },
    { animation: "hang", at: at("hang", "bottom", 132) },
    { animation: "climb", at: at("climb", "left", 20) },
    // Its corner poses (C3c), at the right-hand corners, where nothing else stands.
    ...(skin.animations.over ? [{ animation: "over" as const, at: at("over", "right", 0) }] : []),
    ...(skin.animations.under ? [{ animation: "under" as const, at: at("under", "right", OUTLINE.height) }] : []),
  ];
  return (
    <MockCard backdrop={backdrop} data-lab-scene={backdrop}>
      {poses.map(({ animation, at }) => (
        <div key={animation} data-lab-pose={animation} style={{ position: "absolute", left: 0, top: 0, transform: `translate(${snap(at.x)}px, ${snap(at.y)}px)` }}>
          <Playing skin={skin} animation={animation} palette={palette} paused={paused} mirrored={at.mirrored} />
        </div>
      ))}
    </MockCard>
  );
}

type Playback = "playing" | "paused" | "idle";
const toBox = (o: { left: number; top: number; width: number; height: number }): Box => ({ left: o.left, top: o.top, right: o.left + o.width, bottom: o.top + o.height });

/**
 * Each creature living on a mock card, run by its brain (M2 C2): on the top edge, `around` the whole card (C3a:
 * corners, climbing the sides, hanging under the bottom), or around a taller card with a `shelf` (C5a: stepping onto it
 * from the left side). The controls stand in for the music. Each creature takes the pointer (C4a): click it, or pick it
 * up and drop it, over the card and a sprite's box around it (the production window's margin) but never over the
 * artwork, or, on the top-edge cards, above the edge. Lab-only labels; the production player's text comes from COPY.md.
 */
function Live({ around = false, shelf = false }: { around?: boolean; shelf?: boolean }) {
  const name = shelf ? "shelf" : around ? "around" : "live";
  const section = `data-lab-${name}`;
  const card = `data-lab-${name}-skin`;
  const px = artPixelPx(window.devicePixelRatio || 1);
  const [playback, setPlayback] = useState<Playback>("playing");
  const [track, setTrack] = useState(0);
  const controls: [string, () => void][] = [
    ["play", () => setPlayback("playing")],
    ["pause", () => setPlayback("paused")],
    ["stop", () => setPlayback("idle")],
    ["next track", () => setTrack((t) => t + 1)],
  ];
  return (
    <section {...{ [section]: "" }} data-lab-playback={playback} style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {controls.map(([label, act]) => (
          <button key={label} type="button" data-lab-control={label} onClick={act} style={{ font: "inherit", height: 24 }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {Object.values(SKINS).map((skin) => (
          <MockCard key={skin.id} backdrop="light" shelf={shelf} {...{ [card]: skin.id }}>
            <Companion
              skin={skin}
              playing={playback === "playing"}
              trackKey={String(track)}
              edge={shelf ? SHELF_TOP_EDGE : TOP_EDGE}
              outline={shelf ? SHELF_OUTLINE : around ? OUTLINE : undefined}
              // Their own seeds, so the sections don't start as triplets.
              seed={hashString(name === "live" ? skin.id : `${skin.id}/${name}`)}
              interactive
              avoid={[ART_BOX]}
              shelf={shelf ? measureShelf(skin, toBox(SHELF_OUTLINE), SHELF_LINE, SHELF_PARTS, px) : null}
            />
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
  if (params.has("live") || params.has("around") || params.has("shelf"))
    return (
      <div style={page}>
        <Live around={params.has("around")} shelf={params.has("shelf")} />
      </div>
    );
  return (
    <div style={page}>
      {!only && <Live />}
      {!only && <Live around />}
      {!only && <Live shelf />}
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
                  {animationsOf(skin).map((animation) => (
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
                {animationsOf(skin).map((animation) => (
                  <div key={animation} data-lab-strip={animation} style={{ display: "flex", gap: 2, alignItems: "end" }}>
                    {animationOf(skin, animation).frames.map((_, f) => (
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
