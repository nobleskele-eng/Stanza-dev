// D1 concept A, "pilcrow": the paragraph mark ¶ as a creature. Its bowl is the head (one eye), its two stems are
// the legs. Proofreader's-pencil red, so it reads on light and dark cards. Drawn for Stanza (docs/COMPANION.md,
// Originality); no reference sprite was used.
import { animated, art, at, blank, flipPosedY, frame, over, place, posed, rotPosedCCW, shift } from "./pixels.mjs";

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
// Where it wears things (D2b), in the body's art: the head mount is the bowl's top, the neck mount the left end of
// a band round the bowl's lower half, where the stems leave it.
const HEAD = { x: 4, y: 0 };
const NECK = { x: 4, y: 5 };
/** The body at (x, y) in a frame, posed: its mounts moved with it. */
const posedAt = (f, x, y) => posed(f, at(HEAD, x, y), at(NECK, x, y));
/** A standing-type frame: body + legs, feet on row 14 (the anchor row); `lift` raises the whole creature. */
function stand(eyes = "open", legs = "stand", lift = 0) {
  const l = LEGS[legs];
  const top = 15 - l.length - 7 - lift;
  return posedAt(frame([body(eyes), X, top], [l, X, top + 7]), X, top);
}

// The sleep z: one legible glyph in both frames, drifting up between them (C6b: a 2-wide second z read as a "c").
const Z = art(["555", "..5", ".5.", "555"]);
// 5×4 (C6b: the 3×3 one read as a "Y").
const HEART = art([".5.5.", "55555", ".555.", "..5.."]);

const standing = stand();
const blink = stand("closed");

// Sit: the thighs (row 10) rest on the edge; the shins hang below it, over the card's face.
const sit = (eyes) => posedAt(frame([body(eyes), X, 3], [LEGS.sit, X, 10]), X, 3);

// Hang: upside down, feet hooked on the edge above (row 0), like a bat. `dx` sways the body.
const hang = (dx) =>
  flipPosedY(posed(frame([body("open"), X + dx, 4], [LEGS.dangle, X, 11]), at(HEAD, X + dx, 4), at(NECK, X, 4)));

// Climb: the walk turned a quarter so the feet grip a wall on the right, heading up.
const climb = (legs) => rotPosedCCW(stand("open", legs));

const sleeping = (z, zx = 13, zy = 2) => posedAt(frame([body("closed"), X, 6], [LEGS.tuck, X, 13], [z, zx, zy]), X, 6);
const held = stand("wide", "dangle", 1);

// Over a corner (C3c): the standing ¶ turned 45° about its feet (supersampled, then checked by eye), one foot on the
// top edge and one against the side. The corner is the bottom-right of pixel (12, 12). Under the bottom corner it's
// the same, upside down, as its hang is (the corner then the top-right of pixel (12, 3)).
// Moved 2 px right and down from C3c (the anchor with it, so it sits on the corner as before): room on the grid
// above and left of its head for a hat (D2b).
const OVER_ART = shift(art([
  "................",
  "................",
  ".....12.........",
  "....1222........",
  "...11.222.......",
  "..111..222......",
  ".11111..222.....",
  "1134111..222....",
  "11111111..222...",
  "111111111..222..",
  "111112..11..2...",
  "22222....11.....",
  "..........1.....",
  "................",
  "................",
  "................",
]), 2, 2);
// Its head is the bowl at the lower left, turned 45°: a hat sits on its top, upright (D2b, the nearest quarter turn).
const OVER = posed(OVER_ART, { x: 5, y: 7 }, { x: 6, y: 11 });

// What it can wear (D2b, drafts for your review). Each is anchored on its mount: the head (the bowl's top) or the
// neck (the bowl's lower half, where the stems leave it). Colours read on the lab's light and dark backdrops.
const ACCESSORIES = {
  headphones: { mount: "head", colours: ["#8a90a0", "#5c6170"], art: [".aaaaaa.", "a......a", "bb......", "bb......"], anchor: { x: 4, y: 1 } },
  beanie: { mount: "head", colours: ["#f2b134", "#2e8b7a", "#22685b"], art: ["...a...", ".bbbbb.", "ccccccc"], anchor: { x: 3, y: 2 } },
  scarf: { mount: "neck", colours: ["#3d63dd", "#f2b134"], art: [".aaaaaaaa", "abbbbbbbb", "aa.......", "b........"], anchor: { x: 1, y: 0 } },
  bow: { mount: "head", colours: ["#ff5d8f", "#c2185b"], art: ["a...a", "aabaa", "a...a"], anchor: { x: 0, y: 2 } },
};

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
    // D2a (your picks): violet ink, and an orange highlighter (pink accent, so the z and heart stand out from it).
    violet: ["#8a5cf0", "#5b37b3", "#fff8ec", "#1c1430", "#f2b134"],
    highlighter: ["#ff8a1f", "#c45f05", "#fff8ec", "#2a1608", "#ff5d8f"],
  },
  animations: {
    idle: animated({ fps: 1, loop: true, durations: [2800, 160] }, [standing, blink]),
    walk: animated({ fps: 4, loop: true, steps: [2, 2] }, [stand("open", "stepA"), stand("open", "stepB")]),
    sit: animated({ fps: 1, loop: true, durations: [3200, 160], anchor: { x: 10, y: 10 } }, [sit("open"), sit("closed")]),
    climb: animated({ fps: 3, loop: true, steps: [2, 2] }, [climb("stepA"), climb("stepB")]), // the walk turned: same stride
    hang: animated({ fps: 1, loop: true, durations: [1400, 1400] }, [hang(0), hang(1)]),
    sleep: animated({ fps: 1, loop: true, durations: [4000, 4000] }, [sleeping(Z, 13, 2), sleeping(Z, 13, 0)]),
    wake: animated({ fps: 4, loop: false }, [sleeping(blank(1, 1)), stand("half", "squat"), standing]),
    // A hop, then a landing crouch under the heart, then up (C6b: standing or hopping, it leaves no room for a 5×4
    // heart). The hop is one row (D2b: two left no room above it for a hat).
    react: animated({ fps: 2, loop: false, durations: [250, 700, 250] }, [stand("open", "stand", 1), over(stand("open", "squat"), [HEART, 11, 1]), standing]),
    held: animated({ fps: 2, loop: true }, [held, posed(held.f.map((r, y) => (y > 10 ? r.slice(1) + "." : r)), held.head, held.neck)]),
    fall: animated({ fps: 1, loop: true }, [stand("wide", "spread", 3)]),
    land: animated({ fps: 6, loop: false }, [stand("closed", "squat"), standing]),
    over: animated({ fps: 3, loop: false, durations: [300], anchor: { x: 12, y: 12 } }, [OVER]),
    under: animated({ fps: 3, loop: false, durations: [300], anchor: { x: 12, y: 3 } }, [flipPosedY(OVER)]),
  },
  accessories: ACCESSORIES,
};
