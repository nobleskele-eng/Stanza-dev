import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { artPixelPx, spriteBoxPx } from "./pixel";
import type { Skin, SkinAnimation } from "./skin";
import { frameToPaths } from "./spritePaths";
import "./companion.css";

/** `--mp-pet-1..n` for a palette, set on the sprite (or any ancestor) so slot classes pick them up. */
export function paletteVars(colours: readonly string[]): CSSProperties {
  return Object.fromEntries(colours.map((c, i) => [`--mp-pet-${i + 1}`, c])) as CSSProperties;
}

/** How long frame `i` stays up. */
export const frameMs = (anim: SkinAnimation, i: number) => anim.durations?.[i] ?? Math.round(1000 / anim.fps);

/**
 * The frame index of a playing animation, advanced by a `setTimeout` chain (never a CSS animation,
 * see companion.css). A non-looping animation stops on its last frame. Restarts when `anim` changes.
 * `playing: false` holds the current frame and schedules nothing.
 */
export function useFrame(anim: SkinAnimation, playing = true): number {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    setFrame(0);
    if (!playing || anim.frames.length < 2) return;
    let i = 0;
    let timer = 0;
    const next = () => {
      timer = window.setTimeout(() => {
        if (i + 1 >= anim.frames.length && !anim.loop) return;
        i = (i + 1) % anim.frames.length;
        setFrame(i);
        next();
      }, frameMs(anim, i));
    };
    next();
    return () => window.clearTimeout(timer);
  }, [anim, playing]);
  return frame;
}

/**
 * One frame of a skin's animation as crisp SVG, sized so every art pixel is whole device pixels. The box is the art
 * rounded up to the layout grid (pixel.ts), and the viewBox grows with it, so the art keeps its scale.
 */
export function Sprite({
  skin,
  animation,
  frame,
  palette = "default",
  dpr = window.devicePixelRatio || 1,
  pixel,
  className,
}: {
  skin: Skin;
  animation: keyof Skin["animations"];
  frame: number;
  palette?: string;
  dpr?: number;
  /** Logical px per art pixel, overriding the dpr rule (the lab's zoomed view; keep it whole device px). */
  pixel?: number;
  className?: string;
}) {
  const frames = skin.animations[animation].frames;
  const paths = useMemo(() => frameToPaths(frames[frame % frames.length]), [frames, frame]);
  const px = pixel ?? artPixelPx(dpr);
  const box = spriteBoxPx(skin.grid, px);
  const units = box / px;
  const colours = skin.palettes[palette] ?? skin.palettes.default;
  return (
    <svg
      className={className}
      width={box}
      height={box}
      viewBox={`0 0 ${units} ${units}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      style={{ display: "block", ...paletteVars(colours) }}
    >
      {paths.map(({ slot, d }) => (
        <path key={slot} className={`mp-pet-c${slot}`} d={d} />
      ))}
    </svg>
  );
}
