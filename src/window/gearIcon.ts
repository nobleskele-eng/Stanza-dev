// The right-click menu's settings item is a picture with no text (your call, M3 L4, DECISIONS.md 2026-11-08), like
// the companion's: a gear, drawn here as a 16 × 16 pixel grid (original: a ring with eight teeth). One mid-grey, so
// it reads on both the light and the dark Windows menu (an outline in a dark colour vanishes on the dark one).
import { frameToRgba, menuIconScale, type RgbaIcon } from "./companionIcon";

export const GEAR: readonly string[] = [
  "................",
  ".......11.......",
  "....1..11..1....",
  "...11.1111.11...",
  "..111111111111..",
  "....11111111....",
  "...1111..1111...",
  ".11111....11111.",
  ".11111....11111.",
  "...1111..1111...",
  "....11111111....",
  "..111111111111..",
  "...11.1111.11...",
  "....1..11..1....",
  ".......11.......",
  "................",
];

export const GEAR_COLOUR = "#7d8594";

/** The gear at the menu's scale for this display (16 px at 100 %, 32 px from 200 %). */
export const gearMenuIcon = (dpr: number): RgbaIcon => frameToRgba(GEAR, [GEAR_COLOUR], menuIconScale(dpr));
