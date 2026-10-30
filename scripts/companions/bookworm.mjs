// D1 concept B, "bookworm": an inchworm cut from ruled notebook paper whose poses are lowercase letters. It stands
// as an "r", inches along as "—" and "n", sleeps curled into an "o", wakes through a "c", hangs on its silk as a "J",
// pops up as an "i" whose dot is a heart, and falls as a "u". Deliberately not the cartoon "green worm in
// glasses". Drawn for Stanza (docs/COMPANION.md, Originality); no reference sprite was used.
import { art, flipY, frame, rotCCW, shape } from "./pixels.mjs";

// Slots: 1 ink rim, 2 paper, 3 rule line, 4 eye, 5 accent (z, heart), 6 silk.
const paper = (rows) =>
  shape(rows, { rim: "1", fill: (_, y) => (y % 3 === 2 ? "3" : "2"), marks: { e: "4", k: "4" } });

const R = (eye = "e") =>
  paper([
    ".#######.",
    `######${eye}##`,
    "#########",
    "########.",
    "####.....",
    "####.....",
    "####.....",
    "####.....",
    "####.....",
    "####.....",
    "####.....",
    ".##......",
  ]);
const R_BLINK = paper([
  ".#######.",
  "#####kk##",
  "#########",
  "########.",
  "####.....",
  "####.....",
  "####.....",
  "####.....",
  "####.....",
  "####.....",
  "####.....",
  ".##......",
]);
const N_MASK = [".########.", "##########", "##########", "##########", "####..####", "####..####", "####..##e#", ".##....##."];
const N = paper(N_MASK);
const U = paper(flipY(N_MASK));
const DASH = paper([".############.", "############e#", "##############", ".############."]);
const O = paper(["..######..", ".########.", "######kk##", "####..####", "####..####", "##########", ".########.", "..######.."]);
const C = paper(["..######..", ".########.", "#######e##", "####......", "####......", "##########", ".########.", "..######.."]);
const J = paper([
  "......##.",
  ".....####",
  ".....#e##",
  ".....####",
  ".....####",
  ".....####",
  ".##..####",
  "####.####",
  "####.####",
  "#########",
  "#########",
  ".#######.",
  "..#####..",
]);
// Draped over the edge: the back half lies on it (row 3 rests on the edge), the head droops to read the card.
const SIT = (eye) =>
  paper([".##########.", "############", "############", "############", "........####", "........####", `........${eye}###`, ".........##."]);
const I = paper([".##.", "####", "#e##", "####", "####", "####", "####", "####", "####", ".##."]);
const L = paper([".##.", "####", "#e##", "####", "####", "####", "####", "####", "####", "####", "####", ".##."]);

const HEART = art(["5.5", "555", ".5."]);
const Z = [art(["555", "..5", ".5.", "555"]), art(["55", ".5", "55"])];

/** Feet on row 14 (the anchor row), left edge at x. */
const ground = (s, x) => frame([s, x, 15 - s.length]);
const hang = (dx) => frame([J, 3 + dx, 2], [art(["6"]), 9, 0], [art(["6"]), 9 + dx, 1]);
/** Moves every row from `from` down by dx (−1 or 1): a tail swinging under the pointer. */
const swing = (f, from, dx) => f.map((r, y) => (y < from ? r : dx > 0 ? "." + r.slice(0, -1) : r.slice(1) + "."));
const HELD = frame([L, 6, 1], [art(["6"]), 7, 0]);
const held = (dx) => swing(HELD, 9, dx);

export const bookworm = {
  id: "bookworm",
  name: "[NEEDS COPY]",
  format: 2,
  grid: 16,
  anchor: { x: 8, y: 14 },
  palettes: {
    default: ["#4a5a86", "#fbf6e8", "#93b8ec", "#1d1b2e", "#f2b134", "#a7a294"],
    kraft: ["#6b4a2e", "#e2c08d", "#c1955a", "#2a1b10", "#f25f5c", "#a7a294"],
    graph: ["#2f6b55", "#f2f8f1", "#9bd3b5", "#14261d", "#f2b134", "#a7a294"],
  },
  animations: {
    idle: { fps: 1, loop: true, frames: [ground(R(), 4), ground(R_BLINK, 4)], durations: [2800, 160] },
    // Inching: entering the arch moves nothing (the tail catches up to the planted head); entering the dash moves
    // 4 px (the head reaches forward from the planted tail).
    walk: { fps: 3, loop: true, frames: [ground(DASH, 1), ground(N, 5)], steps: [4, 0] },
    // Row 10 (the draped back half) rests on the edge; the head droops below it.
    sit: { fps: 1, loop: true, frames: [frame([SIT("e"), 2, 7]), frame([SIT("k"), 2, 7])], durations: [3200, 160], anchor: { x: 8, y: 10 } },
    climb: { fps: 3, loop: true, frames: [rotCCW(ground(DASH, 1)), rotCCW(ground(N, 5))], steps: [4, 0] }, // the walk turned: same stride
    hang: { fps: 1, loop: true, frames: [hang(0), hang(1)], durations: [1400, 1400] },
    sleep: { fps: 1, loop: true, frames: [frame([O, 3, 7], [Z[0], 12, 1]), frame([O, 3, 7], [Z[1], 12, 3])], durations: [4000, 4000] },
    wake: { fps: 4, loop: false, frames: [ground(O, 3), ground(C, 3), ground(R(), 4)] },
    react: { fps: 2, loop: false, frames: [frame([I, 6, 5], [HEART, 6, 1]), ground(R(), 4)], durations: [700, 300] },
    held: { fps: 2, loop: true, frames: [held(-1), held(1)] },
    fall: { fps: 1, loop: true, frames: [ground(U, 3)] },
    land: { fps: 6, loop: false, frames: [ground(DASH, 1), ground(R(), 4)] },
  },
};
