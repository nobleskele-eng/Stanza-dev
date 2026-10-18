// D1 concept C, "cassette": a little tape on two legs. Its reels are its eyes, and they turn while it walks (the
// player's music, made visible). It hangs from a loop of its own tape under the card. Drawn for Stanza
// (docs/COMPANION.md, Originality); no reference sprite was used.
import { art, frame, place, recolor, rotCCW } from "./pixels.mjs";

// Slots: 1 outline, 2 shell, 3 label, 4 reel, 5 window/hub, 6 label stripe, 7 tape, 8 accent (z, heart).
const SHELL = art([
  ".111111111111.",
  "12222222222221",
  "12666666666621",
  "12333333333321",
  "12355555555321",
  "12355555555321",
  "12355555555321",
  "12333333333321",
  "12222222222221",
  ".111111111111.",
]);
const REELS = {
  open: art(["444..444", "454..454", "444..444"]),
  turn: art(["454..454", "545..545", "454..454"]),
  closed: art(["........", "444..444", "........"]),
  wide: art(["444..444", "444..444", "454..454"]),
  hearts: art(["8.8..8.8", "888..888", ".8....8."]),
};
/** The tape body, 14×10, with its eyes (reels) in the window. */
const body = (eyes = "open") => place(SHELL, REELS[eyes], 3, 4);

const LEGS = {
  stand: art(["..1......1..", "..1......1..", ".11.....11.."]),
  stepA: art(["..1......1..", "..1.....1...", ".11....11..."]),
  stepB: art(["..1......1..", "...1.....1..", "..11.....11."]),
  tuck: art([".11.....11.."]),
  // Sitting on the edge: legs over it, feet swinging.
  sitA: art(["..1......1..", "..1......1..", "..11.....11."]),
  sitB: art(["..1......1..", "..1......1..", ".11.....11.."]),
  dangle: art(["..1......1..", "..1......1..", "..1......1..", ".11.....11.."]),
  spread: art([".1........1.", "1..........1"]),
};
// Legs in the shell colour: the near-black outline colour disappears against a dark card (seen in the lab).
for (const k of Object.keys(LEGS)) LEGS[k] = recolor(LEGS[k], { 1: "2" });

const X = 1;
/** Body + legs with the feet on row 14 (the anchor row); `lift` raises the whole creature. */
function stand(eyes = "open", legs = "stand", lift = 0) {
  const l = LEGS[legs];
  const top = 15 - l.length - 10 - lift;
  return frame([body(eyes), X, top], [l, X + 1, top + 10]);
}

const Z = [art(["888", "..8", ".8.", "888"]), art(["88", ".8", "88"])];

// Sit: the shell's bottom edge (row 11) rests on the card's edge; the legs hang over it.
const sit = (eyes, legs) => frame([body(eyes), X, 2], [LEGS[legs], X + 1, 12]);

// Hang: from a loop of tape pulled out of the window, up to the edge above (row 0). `dx` sways the body.
function hang(dx) {
  let f = frame([body("open"), X + dx, 2], [LEGS.dangle, X + 1 + dx, 12]);
  for (let y = 0; y < 6; y++) f = place(f, art(["7..7"]), 6 + (y >= 2 ? dx : 0), y);
  return f;
}

export const cassette = {
  id: "cassette",
  name: "[NEEDS COPY]",
  format: 1,
  grid: 16,
  anchor: { x: 8, y: 14 },
  palettes: {
    default: ["#30343f", "#9aa3b2", "#f6e9cc", "#ffffff", "#262a35", "#ff7a3d", "#7a4a2c", "#ff5d8f"],
    clear: ["#2c3f57", "#8fc3e8", "#ffffff", "#ffffff", "#1c2a3a", "#ffd166", "#7a4a2c", "#ff5d8f"],
    chrome: ["#30343f", "#e3d9c6", "#2f2f35", "#ffffff", "#141418", "#e5484d", "#7a4a2c", "#ffd166"],
  },
  animations: {
    idle: { fps: 1, loop: true, frames: [stand(), stand("closed")], durations: [2800, 160] },
    walk: { fps: 4, loop: true, frames: [stand("open", "stepA"), stand("turn", "stepB")] },
    sit: { fps: 1, loop: true, frames: [sit("open", "sitA"), sit("open", "sitB")], durations: [2400, 2400] },
    climb: { fps: 3, loop: true, frames: [rotCCW(stand("open", "stepA")), rotCCW(stand("turn", "stepB"))] },
    hang: { fps: 1, loop: true, frames: [hang(0), hang(1)], durations: [1400, 1400] },
    sleep: { fps: 1, loop: true, frames: [frame([stand("closed", "tuck"), 0, 0], [Z[0], 12, 0]), frame([stand("closed", "tuck"), 0, 0], [Z[1], 13, 1])], durations: [4000, 4000] },
    wake: { fps: 4, loop: false, frames: [stand("closed", "tuck"), stand("turn"), stand()] },
    react: { fps: 2, loop: false, frames: [frame([stand("hearts", "stand", 1), 0, 0]), stand()], durations: [900, 300] },
    held: { fps: 2, loop: true, frames: [stand("wide", "dangle", 1), stand("wide", "dangle", 1).map((r, y) => (y > 11 ? r.slice(1) + "." : r))] },
    fall: { fps: 1, loop: true, frames: [stand("wide", "spread", 3)] },
    land: { fps: 6, loop: false, frames: [stand("closed", "tuck"), stand()] },
  },
};
