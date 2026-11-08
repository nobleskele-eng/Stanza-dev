// D1 concept C, "cassette": a little tape on two legs. Its reels are its eyes, and they turn while it walks (the
// player's music, made visible). It hangs from a loop of its own tape under the card. Drawn for Stanza
// (docs/COMPANION.md, Originality); no reference sprite was used.
import { animated, art, frame, over, place, posed, recolor, rotPosedCCW } from "./pixels.mjs";

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
// Where it wears things (D2b): every accessory is drawn the shell's width and anchored on the shell's top-left pixel,
// inside the shell's outline (held and falling, the shell touches the grid's top: nothing can go above it). The head
// mount is the shell's top-left, the neck mount the left end of a band under the reels.
const NECK_ROW = 7;
/** The shell at (x, y) in a frame, posed: its mounts moved with it. */
const shellAt = (f, x, y) => posed(f, { x, y }, { x, y: y + NECK_ROW });
/** Body + legs with the feet on row 14 (the anchor row); `lift` raises the whole creature. */
function stand(eyes = "open", legs = "stand", lift = 0) {
  const l = LEGS[legs];
  const top = 15 - l.length - 10 - lift;
  return shellAt(frame([body(eyes), X, top], [l, X + 1, top + 10]), X, top);
}

// The sleep z: one legible glyph in both frames (C6b: a 2-wide second z read as a "c"). The shell fills the grid
// below row 4, so it sways sideways rather than drifting up.
const Z = art(["888", "..8", ".8.", "888"]);

// Sit: the shell's bottom edge (row 11) rests on the card's edge; the legs hang over it.
const sit = (eyes, legs) => shellAt(frame([body(eyes), X, 2], [LEGS[legs], X + 1, 12]), X, 2);

// Hang: from a loop of tape pulled out of the window, up to the edge above (row 0). `dx` sways the body.
function hang(dx) {
  let f = frame([body("open"), X + dx, 2], [LEGS.dangle, X + 1 + dx, 12]);
  for (let y = 0; y < 6; y++) f = place(f, art(["7..7"]), 6 + (y >= 2 ? dx : 0), y);
  return shellAt(f, X + dx, 2);
}

// Round a corner (C3c): its shell can't bend, so it's the climb's body with one leg hooked round the corner. Over the
// top corner (the bottom-right of pixel (14, 6)) the upper leg reaches over onto the top edge while the lower one
// grips the side; under the bottom corner (the top-right of pixel (14, 10)) the lower leg hooks under the card.
const turned = rotPosedCCW(stand());
const climbBody = posed(turned.f.map((r) => r.slice(0, 12) + "...."), turned.head, turned.neck);
const OVER = over(climbBody, [art(["2...", ".222", "...2"]), 12, 4], [art(["222", "..2"]), 12, 11]);
const UNDER = over(climbBody, [art(["2..", ".22", "..2"]), 12, 4], [art(["...2", "2222"]), 12, 10]);

// What it can wear (D2b, drafts for your review): the pilcrow's four, drawn over the shell. The beanie takes the
// place of its top edge; the headphones' band runs just under it, their cups red (grey ones vanished into the grey
// shell); the bow is pinned to its top-left corner (on the right it ran into the sleep z, the same pink); the scarf
// wraps under the reels, its end hanging by the left leg.
const ACCESSORIES = {
  headphones: {
    mount: "head",
    colours: ["#1f2129", "#e5484d"],
    art: ["..............", ".aaaaaaaaaaaa.", "a............a", "bb..........bb", "bb..........bb", "bb..........bb"],
    anchor: { x: 0, y: 0 },
  },
  beanie: { mount: "head", colours: ["#f2b134", "#2e8b7a", "#22685b"], art: [".bbbbbaabbbbb.", "bbbbbbbbbbbbbb", "cccccccccccccc"], anchor: { x: 0, y: 0 } },
  scarf: { mount: "neck", colours: ["#3d63dd", "#f2b134"], art: ["aaaaaaaaaaaaaa", "bbbbbbbbbbbbbb", ".a............", ".b............"], anchor: { x: 0, y: 0 } },
  bow: { mount: "head", colours: ["#ff5d8f", "#c2185b"], art: ["a...a", "aabaa", "a...a"], anchor: { x: 0, y: 0 } },
};

const held = stand("wide", "dangle", 1);

export const cassette = {
  id: "cassette",
  name: "[NEEDS COPY]",
  format: 2,
  grid: 16,
  anchor: { x: 8, y: 14 },
  palettes: {
    default: ["#30343f", "#9aa3b2", "#f6e9cc", "#ffffff", "#262a35", "#ff7a3d", "#7a4a2c", "#ff5d8f"],
    clear: ["#2c3f57", "#8fc3e8", "#ffffff", "#ffffff", "#1c2a3a", "#ffd166", "#7a4a2c", "#ff5d8f"],
    chrome: ["#30343f", "#e3d9c6", "#2f2f35", "#ffffff", "#141418", "#e5484d", "#7a4a2c", "#ffd166"],
    // D2a (your picks): a 90s translucent pink shell, and mint.
    pink: ["#3a2433", "#ff8cc6", "#fff3f8", "#ffffff", "#2b1b26", "#7a5cff", "#7a4a2c", "#ffd166"],
    mint: ["#22362f", "#8fdcbc", "#f4fbf7", "#ffffff", "#1a2a24", "#ff7a3d", "#7a4a2c", "#ff5d8f"],
  },
  animations: {
    idle: animated({ fps: 1, loop: true, durations: [2800, 160] }, [stand(), stand("closed")]),
    walk: animated({ fps: 4, loop: true, steps: [2, 2] }, [stand("open", "stepA"), stand("turn", "stepB")]),
    sit: animated({ fps: 1, loop: true, durations: [2400, 2400], anchor: { x: 8, y: 11 } }, [sit("open", "sitA"), sit("open", "sitB")]),
    // The walk turned: same stride.
    climb: animated({ fps: 3, loop: true, steps: [2, 2] }, [rotPosedCCW(stand("open", "stepA")), rotPosedCCW(stand("turn", "stepB"))]),
    hang: animated({ fps: 1, loop: true, durations: [1400, 1400] }, [hang(0), hang(1)]),
    sleep: animated({ fps: 1, loop: true, durations: [4000, 4000] }, [over(stand("closed", "tuck"), [Z, 12, 0]), over(stand("closed", "tuck"), [Z, 13, 0])]),
    wake: animated({ fps: 4, loop: false }, [stand("closed", "tuck"), stand("turn"), stand()]),
    react: animated({ fps: 2, loop: false, durations: [900, 300] }, [stand("hearts", "stand", 1), stand()]),
    held: animated({ fps: 2, loop: true }, [held, posed(held.f.map((r, y) => (y > 11 ? r.slice(1) + "." : r)), held.head, held.neck)]),
    fall: animated({ fps: 1, loop: true }, [stand("wide", "spread", 3)]),
    land: animated({ fps: 6, loop: false }, [stand("closed", "tuck"), stand()]),
    over: animated({ fps: 3, loop: false, durations: [300], anchor: { x: 14, y: 6 } }, [OVER]),
    under: animated({ fps: 3, loop: false, durations: [300], anchor: { x: 14, y: 10 } }, [UNDER]),
  },
  accessories: ACCESSORIES,
};
