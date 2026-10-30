// D1 concept A, "pilcrow": the paragraph mark ¶ as a creature. Its bowl is the head (one eye), its two stems are
// the legs. Proofreader's-pencil red, so it reads on light and dark cards. Drawn for Stanza (docs/COMPANION.md,
// Originality); no reference sprite was used.
import { art, blank, flipY, frame, place, rotCCW } from "./pixels.mjs";

// Slots: 1 red, 2 shade, 3 eye white, 4 pupil, 5 accent (z, heart).
const EYES = {
  open: ["34", ".."],
  closed: ["22", ".."],
  half: ["24", ".."],
  wide: ["33", "34"],
};

/** The bowl, the bar and the top of both stems: 11×7, facing right. */
function body(eyes = "open") {
  const b = art([
    ".1111111111",
    "11111111.22",
    "11111111.22",
    "21111111.22",
    "22111111.22",
    ".2211111.22",
    "..222111.22",
  ]);
  const [e1, e2] = EYES[eyes];
  const top = eyes === "wide" ? 1 : 2;
  return place(place(b, art([e1]), 4, top), art([e2]), 4, top + 1);
}

const LEGS = {
  stand: art(["......11.22", "......11.22", "......11.22", "......11.22", "......11.22"]),
  stepA: art(["......11.22.", "......11.22.", "......11..22", "......11..22", "......11...."]),
  stepB: art(["......11.22", ".....11..22", ".....11..22", "....11...22", ".........22"]),
  // Sitting: thighs forward along the edge, shins over it.
  sit: art(["......1111222", "........11.22", "........11.22", "........11.22"]),
  tuck: art(["......11.22", "......11.22"]),
  squat: art(["......11.22", ".....11..22"]),
  dangle: art(["......11.22", "......11.22", "......11.22", "......11.22", ".....11..22"]),
  spread: art(["......11.22..", ".....11...22.", "....11.....22"]),
};

const X = 2; // the creature's left edge in the frame
/** A standing-type frame: body + legs, feet on row 14 (the anchor row); `lift` raises the whole creature. */
function stand(eyes = "open", legs = "stand", lift = 0) {
  const l = LEGS[legs];
  const top = 15 - l.length - 7 - lift;
  return frame([body(eyes), X, top], [l, X, top + 7]);
}

const Z = [art(["555", "..5", ".5.", "555"]), art(["55", ".5", "55"])];
const HEART = art(["5.5", "555", ".5."]);

const standing = stand();
const blink = stand("closed");

// Sit: the thighs (row 10) rest on the edge; the shins hang below it, over the card's face.
const sit = (eyes) => frame([body(eyes), X, 3], [LEGS.sit, X, 10]);

// Hang: upside down, feet hooked on the edge above (row 0), like a bat. `dx` sways the body.
const hang = (dx) => flipY(frame([body("open"), X + dx, 4], [LEGS.dangle, X, 11]));

// Climb: the walk turned a quarter so the feet grip a wall on the right, heading up.
const climb = (legs) => rotCCW(stand("open", legs));

const sleeping = (z) => frame([body("closed"), X, 6], [LEGS.tuck, X, 13], [z, 12, 0]);
const held = stand("wide", "dangle", 1);

export const pilcrow = {
  id: "pilcrow",
  name: "[NEEDS COPY]",
  format: 2,
  grid: 16,
  anchor: { x: 10, y: 14 },
  palettes: {
    default: ["#e0412f", "#a8261c", "#fff8ec", "#24141a", "#f2b134"],
    ink: ["#3d63dd", "#2a3f99", "#fff8ec", "#141a33", "#f2b134"],
    marker: ["#2bb673", "#17824e", "#fff8ec", "#10261b", "#ff8fab"],
  },
  animations: {
    idle: { fps: 1, loop: true, frames: [standing, blink], durations: [2800, 160] },
    walk: { fps: 4, loop: true, frames: [stand("open", "stepA"), stand("open", "stepB")], steps: [2, 2] },
    sit: { fps: 1, loop: true, frames: [sit("open"), sit("closed")], durations: [3200, 160], anchor: { x: 10, y: 10 } },
    climb: { fps: 3, loop: true, frames: [climb("stepA"), climb("stepB")], steps: [2, 2] }, // the walk turned: same stride
    hang: { fps: 1, loop: true, frames: [hang(0), hang(1)], durations: [1400, 1400] },
    sleep: { fps: 1, loop: true, frames: [sleeping(Z[0]), sleeping(Z[1])], durations: [4000, 4000] },
    wake: { fps: 4, loop: false, frames: [sleeping(blank(1, 1)), stand("half", "squat"), standing] },
    react: { fps: 2, loop: false, frames: [frame([stand("open", "stand", 2), 0, 0], [HEART, 13, 0]), standing], durations: [700, 300] },
    held: { fps: 2, loop: true, frames: [held, held.map((r, y) => (y > 10 ? r.slice(1) + "." : r))] },
    fall: { fps: 1, loop: true, frames: [stand("wide", "spread", 3)] },
    land: { fps: 6, loop: false, frames: [stand("closed", "squat"), standing] },
  },
};
