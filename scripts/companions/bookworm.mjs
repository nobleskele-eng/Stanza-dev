// D1 concept B, "bookworm": an inchworm cut from ruled notebook paper whose poses are lowercase letters. It stands
// as an "r", inches along as "—" and "n", sleeps curled into an "o", wakes through a "c", hangs on its silk as a "J",
// pops up as an "i" whose dot is a heart, and falls as a "u". Deliberately not the cartoon "green worm in
// glasses". Drawn for Stanza (docs/COMPANION.md, Originality); no reference sprite was used.
import { animated, art, at, flipY, frame, posed, rotPosedCCW, shape } from "./pixels.mjs";

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

// 5×4 (C6b: the 3×3 one read as a "Y").
const HEART = art([".5.5.", "55555", ".555.", "..5.."]);
// The sleep z: one legible glyph in both frames, drifting up between them (C6b: a 2-wide second z read as a "c").
const Z = art(["555", "..5", ".5.", "555"]);

// Round a corner (C3c): an L wrapped round it, head first. Over the top corner (the corner is the bottom-right of
// pixel (11, 11)) its tail lies along the top and its head goes down the side; under the bottom corner (the top-right
// of pixel (11, 4)) its tail is up the side and its head goes along under the card.
const OVER = paper([
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  ".........######.",
  "........########",
  "........########",
  "........#######.",
  "........####....",
  "........####....",
  "........#e##....",
  ".........##.....",
]);
const UNDER = paper([
  ".........##.....",
  "........####....",
  "........####....",
  "........####....",
  "........#######.",
  "........########",
  "........#####e##",
  ".........######.",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
]);

// Where it wears things (D2b), in each shape's own art. The head mount is the head's outer edge by its eye, turned so
// a hat's top points away from the body: up where the head points forward (the r, the dash, the curl) or up (the i,
// the u), to the side where the head points down (the arch, the drape, round the corner) or the silk is in the way
// (the J, held). Turned or flipped so the hat still faces where the head points. The neck mount is a band across the body just behind the head (its top-left, before turning).
const MOUNTS = {
  R: { head: { x: 6, y: 0 }, neck: { x: 0, y: 4 } },
  DASH: { head: { x: 11, y: 0 }, neck: { x: 10, y: 0, turn: 90 } },
  N: { head: { x: 8, y: 3, turn: 90 }, neck: { x: 6, y: 2 } },
  U: { head: { x: 8, y: 0 }, neck: { x: 6, y: 2 } },
  SIT: { head: { x: 10, y: 5, turn: 90 }, neck: { x: 8, y: 4 } },
  O: { head: { x: 7, y: 0 }, neck: { x: 6, y: 3 } },
  C: { head: { x: 7, y: 0 }, neck: { x: 6, y: -1, turn: 90 } },
  I: { head: { x: 2, y: 0 }, neck: { x: 0, y: 3 } },
  L: { head: { x: 0, y: 2, turn: 270 }, neck: { x: 0, y: 3 } },
  J: { head: { x: 5, y: 2, turn: 270 }, neck: { x: 5, y: 4 } },
  OVER: { head: { x: 8, y: 13, turn: 270, flip: true }, neck: { x: 8, y: 11 } },
  UNDER: { head: { x: 13, y: 7, flip: true }, neck: { x: 11, y: 4, turn: 90 } },
};
/** A posed frame: shape `s` (with its mounts `m`) at (x, y), then plain layers over it (a heart, a z, silk). */
const put = (s, m, x, y, ...layers) => posed(frame([s, x, y], ...layers), at(m.head, x, y), at(m.neck, x, y));

/** Feet on row 14 (the anchor row), left edge at x. */
const ground = (s, m, x) => put(s, m, x, 15 - s.length);
const hang = (dx) => put(J, MOUNTS.J, 3 + dx, 2, [art(["6"]), 9, 0], [art(["6"]), 9 + dx, 1]);
/** Moves every row from `from` down by dx (−1 or 1): a tail swinging under the pointer. Its mounts are above `from`. */
const swing = (p, from, dx) => posed(p.f.map((r, y) => (y < from ? r : dx > 0 ? "." + r.slice(0, -1) : r.slice(1) + ".")), p.head, p.neck);
const HELD = put(L, MOUNTS.L, 6, 1, [art(["6"]), 7, 0]);
const held = (dx) => swing(HELD, 9, dx);
const r = (eye) => ground(eye === "blink" ? R_BLINK : R(), MOUNTS.R, 4);

// What it can wear (D2b, drafts for your review): the pilcrow's four in the same colours, sized for a body 4 px thick.
const ACCESSORIES = {
  headphones: { mount: "head", colours: ["#8a90a0", "#5c6170"], art: [".aaaa.", "a....a", "bb....", "bb...."], anchor: { x: 3, y: 1 } },
  beanie: { mount: "head", colours: ["#f2b134", "#2e8b7a", "#22685b"], art: ["..a..", ".bbb.", "ccccc"], anchor: { x: 2, y: 2 } },
  scarf: { mount: "neck", colours: ["#3d63dd", "#f2b134"], art: ["aaaa", "bbbb", "a...", "b..."], anchor: { x: 0, y: 0 } },
  bow: { mount: "head", colours: ["#ff5d8f", "#c2185b"], art: ["a...a", "aabaa", "a...a"], anchor: { x: 2, y: 2 } },
};

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
    // D2a (your picks): a yellow legal pad (its red margin line as the rules), and blueprint paper.
    legal: ["#7a6420", "#fbe78f", "#e8a0a0", "#2a2210", "#e5484d", "#a7a294"],
    blueprint: ["#16305f", "#3b6fc4", "#a9c8f2", "#0d1a33", "#f2b134", "#a7a294"],
  },
  animations: {
    idle: animated({ fps: 1, loop: true, durations: [2800, 160] }, [r(), r("blink")]),
    // Inching: entering the arch moves nothing (the tail catches up to the planted head); entering the dash moves
    // 4 px (the head reaches forward from the planted tail).
    walk: animated({ fps: 3, loop: true, steps: [4, 0] }, [ground(DASH, MOUNTS.DASH, 1), ground(N, MOUNTS.N, 5)]),
    // Row 10 (the draped back half) rests on the edge; the head droops below it.
    sit: animated({ fps: 1, loop: true, durations: [3200, 160], anchor: { x: 8, y: 10 } }, [put(SIT("e"), MOUNTS.SIT, 2, 7), put(SIT("k"), MOUNTS.SIT, 2, 7)]),
    // The walk turned: same stride.
    climb: animated({ fps: 3, loop: true, steps: [4, 0] }, [rotPosedCCW(ground(DASH, MOUNTS.DASH, 1)), rotPosedCCW(ground(N, MOUNTS.N, 5))]),
    hang: animated({ fps: 1, loop: true, durations: [1400, 1400] }, [hang(0), hang(1)]),
    sleep: animated({ fps: 1, loop: true, durations: [4000, 4000] }, [put(O, MOUNTS.O, 3, 7, [Z, 12, 2]), put(O, MOUNTS.O, 3, 7, [Z, 13, 0])]),
    wake: animated({ fps: 4, loop: false }, [ground(O, MOUNTS.O, 3), ground(C, MOUNTS.C, 3), r()]),
    react: animated({ fps: 2, loop: false, durations: [700, 300] }, [put(I, MOUNTS.I, 6, 5, [HEART, 5, 0]), r()]),
    held: animated({ fps: 2, loop: true }, [held(-1), held(1)]),
    fall: animated({ fps: 1, loop: true }, [ground(U, MOUNTS.U, 3)]),
    land: animated({ fps: 6, loop: false }, [ground(DASH, MOUNTS.DASH, 1), r()]),
    over: animated({ fps: 3, loop: false, durations: [300], anchor: { x: 11, y: 11 } }, [put(OVER, MOUNTS.OVER, 0, 0)]),
    under: animated({ fps: 3, loop: false, durations: [300], anchor: { x: 11, y: 4 } }, [put(UNDER, MOUNTS.UNDER, 0, 0)]),
  },
  accessories: ACCESSORIES,
};
