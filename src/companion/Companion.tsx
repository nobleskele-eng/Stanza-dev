// The companion on an edge of the player (PLAN.md §4b, M2 C2). It runs the brain (brain.ts) on one timer and renders
// its pose: every visible change is one re-render of one small SVG, and nothing runs in between (no CSS or Web
// Animations, which keep the transparent window's compositor busy: C0 spike). The timer re-arms itself right after
// each change rather than after React renders, so the brain keeps time even when renders are batched.
// Remount it (a `key`) when the skin changes.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { advance, createBrain, nextChangeAt, pose, setWorld, trackChanged, type Brain, type Pose, type World } from "./brain";
import { artPixelPx } from "./pixel";
import { edgeLength, noSitRanges, placeAround, type EdgeBox, type Outline } from "./place";
import type { Skin } from "./skin";
import { Sprite } from "./Sprite";

const now = () => performance.now();
const reduceQuery = () => window.matchMedia("(prefers-reduced-motion: reduce)");
const samePose = (a: Pose, b: Pose) =>
  a.animation === b.animation && a.frame === b.frame && a.surface === b.surface && a.x === b.x && a.facing === b.facing;

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() => reduceQuery().matches);
  useEffect(() => {
    const q = reduceQuery();
    const update = () => setReduce(q.matches);
    q.addEventListener("change", update);
    return () => q.removeEventListener("change", update);
  }, []);
  return reduce;
}

export function Companion({
  skin,
  palette = "default",
  playing,
  trackKey,
  edge,
  outline,
  blocked = [],
  seed,
  dpr = window.devicePixelRatio || 1,
  className,
}: {
  skin: Skin;
  palette?: string;
  playing: boolean;
  /** Changes when a new track starts (the creature reacts). */
  trackKey: string;
  /** The edge it lives on, in its positioned container's CSS px. Keep `left` and `top` on whole device px. */
  edge: EdgeBox;
  /**
   * The card's whole box, same px (C3a): with it, the creature also climbs the sides and hangs under the bottom.
   * Absent: the top edge only. Its container must leave a sprite's room around the card.
   */
  outline?: Outline;
  /** [from, to) CSS px along the edge where its legs may not hang while it sits (parts reaching the card's top). */
  blocked?: readonly (readonly [number, number])[];
  seed: number;
  dpr?: number;
  className?: string;
}) {
  const px = artPixelPx(dpr);
  const reducedMotion = useReducedMotion();
  const length = edgeLength(edge.width, px);
  const blockedKey = JSON.stringify(blocked);
  const side = outline ? edgeLength(outline.height, px) : 0;
  const bottom = outline ? edgeLength(outline.width, px) : 0;
  const world = useMemo<World>(
    () => ({
      playing,
      reducedMotion,
      edge: { length, noSit: noSitRanges(skin, JSON.parse(blockedKey), px) },
      ...(side ? { around: { side, bottom } } : {}),
    }),
    [playing, reducedMotion, length, blockedKey, skin, px, side, bottom],
  );

  const brain = useRef<Brain | null>(null);
  brain.current ??= createBrain(skin, world, now(), seed);
  const worldRef = useRef(world);
  const timer = useRef(0);
  const [shown, setShown] = useState<Pose>(() => pose(brain.current!));

  const show = useCallback(() => {
    const next = pose(brain.current!);
    setShown((prev) => (samePose(prev, next) ? prev : next));
  }, []);
  const schedule = useCallback(() => {
    window.clearTimeout(timer.current);
    const at = nextChangeAt(brain.current!, skin, worldRef.current);
    if (at === null) return; // holding still until the music or the edge changes
    timer.current = window.setTimeout(
      () => {
        brain.current = advance(brain.current!, skin, worldRef.current, now());
        show();
        schedule();
      },
      Math.max(0, at - now()),
    );
  }, [skin, show]);

  useEffect(() => {
    if (worldRef.current !== world) {
      brain.current = setWorld(brain.current!, skin, worldRef.current, world, now());
      worldRef.current = world;
      show();
    }
    schedule();
    return () => window.clearTimeout(timer.current);
  }, [world, skin, show, schedule]);

  const lastTrack = useRef(trackKey);
  useEffect(() => {
    if (trackKey === lastTrack.current) return;
    lastTrack.current = trackKey;
    brain.current = trackChanged(brain.current!, skin, worldRef.current, now());
    show();
    schedule();
  }, [trackKey, skin, show, schedule]);

  // Without an outline the brain never leaves the top, which needs only the edge.
  const card = outline ?? { left: edge.left, top: edge.top, width: edge.width, height: 0 };
  const { left, top, mirrored } = placeAround(skin, shown.animation, shown.surface, shown.x, shown.facing, px, edge, card);
  const snap = (v: number) => Math.round(v * dpr) / dpr;
  return (
    <div
      className={className ? `mp-companion ${className}` : "mp-companion"}
      data-pet-state={shown.animation}
      data-pet-surface={shown.surface}
      aria-hidden="true"
      // Not interactive until picking it up lands (C4).
      style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", transform: `translate(${snap(left)}px, ${snap(top)}px)` }}
    >
      <Sprite skin={skin} animation={shown.animation} frame={shown.frame} palette={palette} dpr={dpr} mirrored={mirrored} />
    </div>
  );
}
