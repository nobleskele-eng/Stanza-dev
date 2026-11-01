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

describe("companionPickerEntries (C6a)", () => {
  it("every species but the test dummy, in order, the current one awake in its current palette; then its palettes", () => {
    const { species, palettes } = companionPickerEntries({ skin: "bookworm", palette: "kraft" });
    expect(species).toEqual([
      { skin: "pilcrow", palette: "default", awake: false },
      { skin: "bookworm", palette: "kraft", awake: true },
      { skin: "cassette", palette: "default", awake: false },
    ]);
    expect(palettes).toEqual([
      { skin: "bookworm", palette: "default", awake: false },
      { skin: "bookworm", palette: "kraft", awake: true },
      { skin: "bookworm", palette: "graph", awake: false },
    ]);
  });

  it("every species's palettes, the default first, exactly one awake", () => {
    for (const skin of ["pilcrow", "bookworm", "cassette"])
      for (const palette of Object.keys(SKINS[skin].palettes)) {
        const { species, palettes } = companionPickerEntries({ skin, palette });
        expect(species.filter((e) => e.awake).map((e) => e.skin)).toEqual([skin]);
        expect(palettes.map((e) => e.palette)).toEqual(Object.keys(SKINS[skin].palettes));
        expect(palettes[0].palette).toBe("default");
        expect(palettes.filter((e) => e.awake).map((e) => e.palette)).toEqual([palette]);
      }
  });

  it("a stored test dummy (dev and tests only) is no species: all asleep, its own palettes still offered", () => {
    const { species, palettes } = companionPickerEntries({ skin: "test-dummy", palette: "night" });
    expect(species.map((e) => e.skin)).not.toContain("test-dummy");
    expect(species.every((e) => !e.awake)).toBe(true);
    expect(palettes.map((e) => [e.palette, e.awake])).toEqual([
      ["default", false],
      ["night", true],
    ]);
  });
});
