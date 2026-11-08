import { describe, expect, it } from "vitest";
import { dress, misfits, placed, turnArt } from "./accessory";
import { SKINS } from "./registry";
import { REQUIRED_ANIMATIONS, anchorOf, validateSkin, type Accessory, type Skin } from "./skin";

// A 3×2 "cap" for tests: its anchor is its bottom-middle pixel.
const CAP: Accessory = { mount: "head", colours: ["#ff0000", "#00ff00"], art: ["aab", ".a."], anchor: { x: 1, y: 1 } };

/** The test dummy with the cap rigged at the same spot of every frame, for tests. */
function capped(at = { x: 7, y: 2 }): Skin {
  const dummy: Skin = JSON.parse(JSON.stringify(SKINS["test-dummy"]));
  for (const anim of Object.values(dummy.animations)) anim.rig = { head: anim.frames.map(() => ({ ...at })) };
  return { ...dummy, accessories: { cap: CAP } };
}

describe("turnArt", () => {
  it("turns clockwise a quarter at a time, then flips; the anchor goes with its pixel", () => {
    const art = ["ab", "c."];
    expect(turnArt(art, { x: 1, y: 0 })).toEqual({ rows: ["ab", "c."], anchor: { x: 1, y: 0 } });
    expect(turnArt(art, { x: 1, y: 0 }, 90)).toEqual({ rows: ["ca", ".b"], anchor: { x: 1, y: 1 } });
    expect(turnArt(art, { x: 1, y: 0 }, 180)).toEqual({ rows: [".c", "ba"], anchor: { x: 0, y: 1 } });
    expect(turnArt(art, { x: 1, y: 0 }, 270)).toEqual({ rows: ["b.", "ac"], anchor: { x: 0, y: 0 } });
    expect(turnArt(art, { x: 1, y: 0 }, 0, true)).toEqual({ rows: ["c.", "ab"], anchor: { x: 1, y: 1 } });
    // Whatever the turn, the anchor's pixel is the same pixel.
    for (const turn of [0, 90, 180, 270] as const)
      for (const flip of [false, true]) {
        const t = turnArt(art, { x: 1, y: 0 }, turn, flip);
        expect(t.rows[t.anchor.y][t.anchor.x], `${turn} ${flip}`).toBe("b");
      }
  });
});

describe("dress", () => {
  it("draws the accessory over every rigged frame with its anchor on the mount, and marks the colours worn", () => {
    const skin = capped();
    const worn = dress(skin, "cap");
    expect(worn.worn).toEqual({ id: "cap", colours: CAP.colours });
    for (const name of REQUIRED_ANIMATIONS)
      worn.animations[name].frames.forEach((f, i) => {
        expect(f[2].slice(6, 9), `${name} ${i}: row 2`).toBe(".a.".replace(/\./g, (_, k) => skin.animations[name].frames[i][2][6 + k]));
        expect(f[1].slice(6, 9), `${name} ${i}: row 1`).toBe("aab");
      });
    expect(placed(CAP, { x: 7, y: 2 })).toEqual([
      [6, 1, "a"],
      [7, 1, "a"],
      [8, 1, "b"],
      [7, 2, "a"],
    ]);
  });

  it("leaves a frame bare where its rig says null, and the skin as it is for no accessory or an unknown one", () => {
    const skin = capped();
    skin.animations.idle.rig = { head: [null, { x: 7, y: 2 }] };
    const worn = dress(skin, "cap");
    expect(worn.animations.idle.frames[0]).toEqual(skin.animations.idle.frames[0]);
    expect(worn.animations.idle.frames[1]).not.toEqual(skin.animations.idle.frames[1]);
    expect(dress(skin, null)).toBe(skin);
    expect(dress(skin, "crown")).toBe(skin);
  });

  it("pins the anchors the art would set (climb, hang), so wearing something never moves the creature", () => {
    const skin = capped({ x: 7, y: 0 }); // the cap pokes above everything
    const worn = dress(skin, "cap");
    for (const name of ["climb", "hang"] as const) expect(anchorOf(worn, name), name).toEqual(anchorOf(skin, name));
  });
});

describe("misfits and the validator", () => {
  it("a rig that fits passes; one that pushes the accessory off the grid is named, frame by frame", () => {
    expect(misfits(capped(), "cap")).toEqual([]);
    const off = capped({ x: 0, y: 2 }); // the cap's left pixel lands at x = −1
    expect(misfits(off, "cap")).toContain("animations.idle.frames.0");
    expect(misfits(capped(), "crown")).toEqual(["accessories.crown"]);
  });

  it("accepts accessories and rigs, and rejects bad ones or a missing rig", () => {
    const ok = capped();
    expect(validateSkin(JSON.parse(JSON.stringify(ok))).issues).toEqual([]);
    const bad = JSON.parse(JSON.stringify(ok));
    bad.accessories.cap.art = ["aaz"];
    expect(validateSkin(bad).issues).toEqual([{ code: "accessory-invalid", path: "accessories.cap" }]);
    const unrigged = JSON.parse(JSON.stringify(ok));
    delete unrigged.animations.walk.rig;
    expect(validateSkin(unrigged).issues).toEqual([{ code: "rig-missing", path: "animations.walk.rig.head" }]);
    const wrongLength = JSON.parse(JSON.stringify(ok));
    wrongLength.animations.walk.rig.head.push(null);
    expect(validateSkin(wrongLength).issues).toEqual([{ code: "rig-invalid", path: "animations.walk.rig.head" }]);
    const badTurn = JSON.parse(JSON.stringify(ok));
    badTurn.animations.walk.rig.head[0].turn = 45;
    expect(validateSkin(badTurn).issues).toEqual([{ code: "rig-invalid", path: "animations.walk.rig.head" }]);
  });

  it("every bundled skin's accessories fit every frame they're rigged for", () => {
    for (const skin of Object.values(SKINS))
      for (const id of Object.keys(skin.accessories ?? {})) expect(misfits(skin, id), `${skin.id} ${id}`).toEqual([]);
  });
});
