// The companion on an edge of the player (PLAN.md §4b, M2 C2). It runs the brain (brain.ts) on one timer and renders
// its pose: every visible change is one re-render of one small SVG, and nothing runs in between (no CSS or Web
// Animations, which keep the transparent window's compositor busy: C0 spike). The timer re-arms itself right after
// each change rather than after React renders, so the brain keeps time even when renders are batched.
// With `interactive` (C4a) it can be clicked, and picked up, carried and dropped with the pointer. With a `shelf` (C5a)
// it also lives on a ledge inside the card. Remount it (a `key`) when the skin changes.
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  advance,
  carry,
  createBrain,
  drop,
  nextChangeAt,
  pickUp,
  poke,
  pose,
  setWorld,
  trackChanged,
  type Brain,
  type Pose,
  type World,
} from "./brain";
import type { Shelf } from "./measure";
import { artPixelPx, spriteBoxPx } from "./pixel";
import { carryPoint, edgeLength, landingFor, noSitRanges, placeAround, type EdgeBox, type Outline } from "./place";
import type { Skin } from "./skin";
import { Sprite } from "./Sprite";

const now = () => performance.now();
const reduceQuery = () => window.matchMedia("(prefers-reduced-motion: reduce)");
const samePose = (a: Pose, b: Pose) =>
  a.animation === b.animation &&
  a.frame === b.frame &&
  a.surface === b.surface &&
  a.x === b.x &&
  a.facing === b.facing &&
  a.air?.x === b.air?.x &&
  a.air?.y === b.air?.y;
/** A press that moves this far (CSS px) picks the creature up; less is a click. */
const PICK_UP_PX = 4;

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
  interactive = false,
  room,
  avoid = [],
  shelf,
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
  /** It takes the pointer (C4a): a click makes it react; a drag picks it up, and letting go drops it. */
  interactive?: boolean;
  /**
   * Where it may be carried, same px. Default: the card and a sprite's box around it (the window's margin, C3b), or
   * above the top edge when there's no outline.
   */
  room?: Outline;
  /** Boxes, same px, it never covers while carried or falling: the artwork (CLAUDE.md). */
  avoid?: readonly Outline[];
  /**
   * A shelf inside the card (C5a), same px, as `measureShelf` trims it: it steps on and off at its doors from a climb,
   * and a drop can land on it. Used only with `outline`.
   */
  shelf?: Shelf | null;
  className?: string;
}) {
  const px = artPixelPx(dpr);
  const reducedMotion = useReducedMotion();
  const length = edgeLength(edge.width, px);
  const blockedKey = JSON.stringify(blocked);
  const side = outline ? edgeLength(outline.height, px) : 0;
  const bottom = outline ? edgeLength(outline.width, px) : 0;
  const ledge = outline ? shelf : null;
  // Its positions from the top's (the card's left), and the side position whose climb anchor is level with its stand.
  const shelfKey = ledge
    ? JSON.stringify({
        length: edgeLength(ledge.edge.width, px),
        left: Math.round((ledge.edge.left - edge.left) / px),
        doors: ledge.doors,
        at: Math.round((ledge.edge.top - outline!.top) / px) - 1,
      })
    : "";
  const world = useMemo<World>(
    () => ({
      playing,
      reducedMotion,
      edge: { length, noSit: noSitRanges(skin, JSON.parse(blockedKey), px) },
      ...(side ? { around: { side, bottom } } : {}),
      ...(side && shelfKey ? { shelf: JSON.parse(shelfKey) } : {}),
    }),
    [playing, reducedMotion, length, blockedKey, skin, px, side, bottom, shelfKey],
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
  const update = useCallback(
    (next: Brain) => {
      brain.current = next;
      show();
      schedule();
    },
    [show, schedule],
  );

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
    update(trackChanged(brain.current!, skin, worldRef.current, now()));
  }, [trackKey, skin, update]);

  // Without an outline the brain never leaves the top, which needs only the edge.
  const card = outline ?? { left: edge.left, top: edge.top, width: edge.width, height: 0 };
  const placed = shown.air
    ? { left: card.left + shown.air.x * px, top: card.top + shown.air.y * px, mirrored: shown.facing < 0 }
    : placeAround(skin, shown.animation, shown.surface, shown.x, shown.facing, px, edge, card, ledge?.edge);
  const { left, top, mirrored } = placed;
  const snap = (v: number) => Math.round(v * dpr) / dpr;

  // The pointer (C4a). A press is a click until it moves PICK_UP_PX; then the creature is in the pointer's hand,
  // keeping the spot it was grabbed by, until the press ends and it's dropped. It may be carried over the card, but
  // never over what it must avoid (the artwork), and its fall slides off it.
  const press = useRef<{ id: number; x: number; y: number; grab: { x: number; y: number }; held: boolean } | null>(null);
  const box = spriteBoxPx(skin.grid, px);
  const carryRoom =
    room ??
    (outline
      ? { left: card.left - box, top: card.top - box, width: card.width + 2 * box, height: card.height + 2 * box }
      : { left: edge.left - box, top: edge.top - box, width: edge.width + 2 * box, height: box });
  /** The pointer in the container's px (the creature's own box is placed in them). */
  const local = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.offsetParent?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || press.current) return;
    e.preventDefault(); // no text selection while it's carried
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    press.current = { id: e.pointerId, ...p, grab: { x: p.x - left, y: p.y - top }, held: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = press.current;
    if (!g || e.pointerId !== g.id) return;
    const p = local(e);
    if (!g.held && Math.hypot(p.x - g.x, p.y - g.y) < PICK_UP_PX) return;
    const b = brain.current!;
    const at = carryPoint(skin, { left: p.x - g.grab.x, top: p.y - g.grab.y }, b.facing < 0, px, card, carryRoom, avoid);
    if (g.held) {
      brain.current = carry(b, at);
      show();
    } else {
      g.held = true;
      update(pickUp(b, skin, worldRef.current, now(), at));
    }
  };
  const release = (e: PointerEvent<HTMLDivElement>, click: boolean) => {
    const g = press.current;
    if (!g || e.pointerId !== g.id) return;
    press.current = null;
    const b = brain.current!;
    if (g.held && b.air) {
      // Under reduced motion it lives on the top only (C3a), so that's where it lands.
      const to = landingFor(skin, b.air, b.facing, px, edge, outline && !reducedMotion ? card : null, avoid, ledge?.edge ?? null);
      update(drop(b, skin, worldRef.current, now(), to));
    } else if (click && !g.held) update(poke(b, skin, worldRef.current, now()));
  };

  return (
    <div
      className={className ? `mp-companion ${className}` : "mp-companion"}
      data-pet-state={shown.animation}
      data-pet-surface={shown.air ? "air" : shown.surface}
      aria-hidden="true"
      {...(interactive
        ? {
            // The window-drag handler (C8) leaves it alone.
            "data-no-drag": "",
            onPointerDown,
            onPointerMove,
            onPointerUp: (e: PointerEvent<HTMLDivElement>) => release(e, true),
            onPointerCancel: (e: PointerEvent<HTMLDivElement>) => release(e, false),
            onLostPointerCapture: (e: PointerEvent<HTMLDivElement>) => release(e, false),
          }
        : {})}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        pointerEvents: interactive ? "auto" : "none",
        ...(interactive ? { touchAction: "none", cursor: shown.animation === "held" ? "grabbing" : "grab" } : {}),
        transform: `translate(${snap(left)}px, ${snap(top)}px)`,
      }}
    >
      <Sprite skin={skin} animation={shown.animation} frame={shown.frame} palette={palette} dpr={dpr} mirrored={mirrored} />
    </div>
  );
}
