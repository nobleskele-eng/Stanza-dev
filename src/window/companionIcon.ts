// The companion's on/off menu item is an icon with no text (your call, docs/DECISIONS.md 2026-10-22): the cassette
// awake (idle) while the pet is on, asleep while it is off. A native icon item can't also carry a check mark, so the
// pose is the state. The picker (C6a) speaks the same way: every species and palette is a picture, the chosen one
// awake. Pure: frame rows → RGBA, for Tauri's `Image.new`.
import { SKINS } from "../companion/registry";
import type { Skin } from "../companion/skin";
import { TRANSPARENT } from "../companion/spritePaths";

export const MENU_ICON_SKIN = "cassette";

export interface RgbaIcon {
  /** Row-major RGBA bytes, top to bottom. A plain array: it crosses Tauri's JSON IPC as-is. */
  rgba: number[];
  width: number;
  height: number;
}

/** `#rgb` / `#rrggbb` → [r, g, b]. */
function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** One frame at `scale` device px per art pixel; "." stays fully transparent. */
export function frameToRgba(frame: readonly string[], colours: readonly string[], scale: number): RgbaIcon {
  const s = Math.max(1, Math.floor(scale));
  const height = frame.length * s;
  const width = Math.max(...frame.map((r) => r.length)) * s;
  const rgba = new Array<number>(width * height * 4).fill(0);
  frame.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === TRANSPARENT) return;
      const [r, g, b] = hexRgb(colours[Number(c) - 1]);
      for (let dy = 0; dy < s; dy++) {
        for (let dx = 0; dx < s; dx++) {
          const i = ((y * s + dy) * width + x * s + dx) * 4;
          rgba[i] = r;
          rgba[i + 1] = g;
          rgba[i + 2] = b;
          rgba[i + 3] = 255;
        }
      }
    });
  });
  return { rgba, width, height };
}

/**
 * Device px per art pixel for a menu icon: 1 up to 199%, 2 at 200%. The 16-px grid at 1:1 is the usual menu-icon
 * size; rounding 150% up would make a 32-px icon taller than the menu row (untested on a real scaled display).
 */
export const menuIconScale = (dpr: number) => Math.max(1, Math.floor(Number.isFinite(dpr) ? dpr : 1));

/** A skin in one of its palettes (else its default), awake (idle, first frame) or asleep (sleep, first frame). */
export function skinMenuIcon(skin: Skin, palette: string, awake: boolean, dpr: number): RgbaIcon {
  const frame = skin.animations[awake ? "idle" : "sleep"].frames[0];
  return frameToRgba(frame, skin.palettes[palette] ?? skin.palettes.default, menuIconScale(dpr));
}

/** The on (awake) or off (asleep) icon, in the skin's default palette. */
export function companionMenuIcon(on: boolean, dpr: number, skin: Skin = SKINS[MENU_ICON_SKIN]): RgbaIcon {
  return skinMenuIcon(skin, "default", on, dpr);
}
