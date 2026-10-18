// Generates companions/test-dummy/companion.json: the deliberately plain placeholder skin of M2 C1 (not the
// creature design, which comes from the D1 round). Format: docs/COMPANION.md.
// Run: node scripts/gen-test-dummy.mjs [out-path]
import { writeFileSync } from "node:fs";
const E = "................";
const body = (eyes = "open") => [
  ".....111111.....",
  "...1122222211...",
  "..122222222221..",
  ".12222222222221.",
  eyes === "open" ? ".12221222212221." : ".12222222222221.",
  eyes === "open" ? ".12221222212221." : ".12211222211221.",
  ".12222222222221.",
  ".12222222222221.",
  "..122222222221..",
  "...1111111111...",
];
const legsA = ["...1.1....1.1...", "...1.1....1.1..."];
const legsB = ["....1.1..1.1....", "....1.1..1.1...."];
const dangle = ["....1......1....", "....1......1...."];
const frame = (top, mid, bottom) => {
  const rows = [...top, ...mid, ...bottom];
  while (rows.length < 16) rows.push(E);
  if (rows.length !== 16 || rows.some((r) => r.length !== 16)) throw new Error("bad frame " + JSON.stringify(rows));
  return rows;
};
const shift = (rows, dx) => rows.map((r) => (dx > 0 ? ".".repeat(dx) + r.slice(0, 16 - dx) : r.slice(-dx) + ".".repeat(-dx)));
const open = frame([E, E, E], body("open"), [...legsA, E]);
const closed = frame([E, E, E], body("closed"), [...legsA, E]);
const half = frame([E, E, E], body("half"), [...legsA, E]);
const walkB = frame([E, E, E], body("open"), [...legsB, E]);
const sit = (eyes) => frame([E, E, E, E, E], body(eyes), ["..11........11.."]);
const z = ["............333.", ".............3..", "............333."];
const heart = [".....33.33......", ".....33333......", "......333......."];
const armsUp = ["..1..........1..", "..1..........1.."];
const hang = (dx) => frame(shift(["...1........1...", "...1........1...", "...1........1..."], dx), shift(body("open"), dx), shift(dangle, dx));
const held = (dx) => frame([...armsUp, E], shift(body("open"), dx), shift(dangle, dx));
const climbA = frame([E, E, E], body("open").map((r, i) => (i === 3 ? "1" + r.slice(1) : r)), [...legsA, E]);
const climbB = frame([E, E, E], body("open").map((r, i) => (i === 6 ? "1" + r.slice(1) : r)), [...legsB, E]);
const fall = frame([...armsUp, E], body("open"), [...dangle, E]);
const squash = frame([E, E, E, E], body("open").filter((_, i) => i !== 2 && i !== 7), ["..1.1......1.1..", E, E]);
const skin = {
  id: "test-dummy",
  name: "[NEEDS COPY]",
  format: 2,
  grid: 16,
  anchor: { x: 8, y: 14 },
  palettes: {
    default: ["#1d1b2e", "#f2a65a", "#fff3d6"],
    night: ["#e8e6f2", "#4b5a8a", "#ffd166"],
  },
  animations: {
    idle: { fps: 1, loop: true, frames: [open, closed], durations: [2800, 160] },
    walk: { fps: 4, loop: true, frames: [open, walkB] },
    sit: { fps: 1, loop: true, frames: [sit("open"), sit("closed")], durations: [3200, 160] },
    climb: { fps: 3, loop: true, frames: [climbA, climbB] },
    hang: { fps: 2, loop: true, frames: [hang(0), hang(1)] },
    sleep: { fps: 1, loop: true, frames: [frame(z, body("closed"), [...legsA]), closed], durations: [4000, 4000] },
    wake: { fps: 4, loop: false, frames: [closed, half, open] },
    react: { fps: 2, loop: false, frames: [frame(heart, body("open"), [...legsA]), open], durations: [600, 300] },
    held: { fps: 2, loop: true, frames: [held(0), held(1)] },
    fall: { fps: 1, loop: true, frames: [fall] },
    land: { fps: 6, loop: false, frames: [squash, open] },
  },
};
const out = process.argv[2] ?? new URL("../companions/test-dummy/companion.json", import.meta.url);
writeFileSync(out, JSON.stringify(skin, null, 2) + "\n");
console.log("ok", Object.keys(skin.animations).length, "animations");
