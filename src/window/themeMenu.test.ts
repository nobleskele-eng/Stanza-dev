import { Image } from "@tauri-apps/api/image";
import { describe, expect, it } from "vitest";
import { NEEDS_COPY } from "../copy";
import { SKINS } from "../companion/registry";
import { MANIFESTS } from "../theme/registry";
import type { ThemeManifest } from "../theme/variant";
import { companionMenuItem, companionPickerEntries, themeMenuEntries } from "./themeMenu";

describe("themeMenuEntries", () => {
  it("lists every theme in registry order by its own name, only the active one checked", () => {
    const entries = themeMenuEntries(MANIFESTS, "t3-pill");
    expect(entries.map((e) => e.id)).toEqual(Object.keys(MANIFESTS));
    expect(entries.map((e) => e.text)).toEqual(Object.values(MANIFESTS).map((m) => m.name));
    expect(entries.filter((e) => e.checked).map((e) => e.id)).toEqual(["t3-pill"]);
  });

  it("a theme with a missing or blank name shows [NEEDS COPY], never its id", () => {
    const base = MANIFESTS["t1-default"];
    const nameless = { ...base, id: "user-theme", name: undefined } as unknown as ThemeManifest;
    const blank = { ...base, id: "blank-theme", name: "  " };
    const entries = themeMenuEntries({ "user-theme": nameless, "blank-theme": blank }, "user-theme");
    expect(entries.map((e) => e.text)).toEqual([NEEDS_COPY, NEEDS_COPY]);
  });
});

describe("companionMenuItem", () => {
  const act = () => {};
  it("with its icon: an icon item with no text and no check mark (the pose is the state)", () => {
    const icon = new Image(7);
    expect(companionMenuItem(true, icon, act)).toEqual({ text: "", icon, action: act });
    expect(companionMenuItem(false, icon, act)).not.toHaveProperty("checked");
  });

  it("without an icon: falls back to the check item, its text COPY.md's, never ours", () => {
    expect(companionMenuItem(true, null, act)).toEqual({ text: NEEDS_COPY, checked: true, action: act });
    expect(companionMenuItem(false, null, act)).toMatchObject({ checked: false });
  });
});

describe("companionPickerEntries (C6a, D2c)", () => {
  it("every species but the test dummy, in order, the current one awake in its current palette; then its palettes; then what it can wear", () => {
    const { species, palettes, accessories } = companionPickerEntries({ skin: "bookworm", palette: "kraft", accessory: null });
    expect(species).toEqual([
      { skin: "pilcrow", palette: "default", accessory: null, awake: false },
      { skin: "bookworm", palette: "kraft", accessory: null, awake: true },
      { skin: "cassette", palette: "default", accessory: null, awake: false },
    ]);
    expect(palettes).toEqual([
      { skin: "bookworm", palette: "default", accessory: null, awake: false },
      { skin: "bookworm", palette: "kraft", accessory: null, awake: true },
      { skin: "bookworm", palette: "graph", accessory: null, awake: false },
      { skin: "bookworm", palette: "legal", accessory: null, awake: false },
      { skin: "bookworm", palette: "blueprint", accessory: null, awake: false },
    ]);
    // Bare first (awake: it wears nothing), then each accessory, in the current palette.
    expect(accessories).toEqual(
      [null, "headphones", "beanie", "scarf", "bow"].map((accessory) => ({ skin: "bookworm", palette: "kraft", accessory, awake: accessory === null })),
    );
  });

  it("every picture shows what picking it gives: wearing what it wears now, where that species has it", () => {
    const { species, palettes, accessories } = companionPickerEntries({ skin: "cassette", palette: "mint", accessory: "scarf" });
    expect(species.map((e) => [e.skin, e.palette, e.accessory, e.awake])).toEqual([
      ["pilcrow", "default", "scarf", false],
      ["bookworm", "default", "scarf", false],
      ["cassette", "mint", "scarf", true],
    ]);
    expect(palettes.every((e) => e.accessory === "scarf")).toBe(true);
    expect(accessories.filter((e) => e.awake).map((e) => e.accessory)).toEqual(["scarf"]);
    expect(accessories.every((e) => e.skin === "cassette" && e.palette === "mint")).toBe(true);
  });

  it("every species's palettes and accessories, the default and bare first, exactly one of each awake", () => {
    for (const skin of ["pilcrow", "bookworm", "cassette"])
      for (const palette of Object.keys(SKINS[skin].palettes))
        for (const accessory of [null, ...Object.keys(SKINS[skin].accessories!)]) {
          const { species, palettes, accessories } = companionPickerEntries({ skin, palette, accessory });
          expect(species.filter((e) => e.awake).map((e) => e.skin)).toEqual([skin]);
          expect(palettes.map((e) => e.palette)).toEqual(Object.keys(SKINS[skin].palettes));
          expect(palettes[0].palette).toBe("default");
          expect(palettes.filter((e) => e.awake).map((e) => e.palette)).toEqual([palette]);
          expect(accessories.map((e) => e.accessory)).toEqual([null, ...Object.keys(SKINS[skin].accessories!)]);
          expect(accessories.filter((e) => e.awake).map((e) => e.accessory)).toEqual([accessory]);
        }
  });

  it("a stored test dummy (dev and tests only) is no species: all asleep, its own palettes still offered, nothing to wear", () => {
    const { species, palettes, accessories } = companionPickerEntries({ skin: "test-dummy", palette: "night", accessory: "beanie" });
    expect(species.map((e) => e.skin)).not.toContain("test-dummy");
    expect(species.every((e) => !e.awake)).toBe(true);
    expect(palettes.map((e) => [e.palette, e.accessory, e.awake])).toEqual([
      ["default", null, false],
      ["night", null, true],
    ]);
    expect(accessories).toEqual([]);
  });
});
