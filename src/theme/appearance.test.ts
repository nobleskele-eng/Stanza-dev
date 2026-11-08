import { describe, expect, it } from "vitest";
import {
  APPEARANCE_STORAGE_KEY,
  loadAppearance,
  defaultCompanion,
  parseAppearance,
  pickCompanion,
  saveAppearance,
  selectTheme,
  type StorageLike,
} from "./appearance";
import { DEFAULT_SKIN, SKINS } from "../companion/registry";
import { DEFAULT_THEME, MANIFESTS } from "./registry";

function memory(initial?: string): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(APPEARANCE_STORAGE_KEY, initial);
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("appearance persistence", () => {
  it("defaults to the default theme with no overrides when nothing is stored", () => {
    const a = loadAppearance(memory(), MANIFESTS);
    expect(a.theme).toBe(DEFAULT_THEME);
    expect(a.variant.overrides).toEqual({});
  });

  it("round-trips a theme and a valid override", () => {
    const store = memory();
    const a = selectTheme(MANIFESTS, "t5-kinetic");
    const token = Object.keys(MANIFESTS["t5-kinetic"].controls ?? {}).find((t) => MANIFESTS["t5-kinetic"].controls![t].type === "color")!;
    a.variant.overrides[token] = "#123456";
    saveAppearance(store, a);
    const back = loadAppearance(store, MANIFESTS);
    expect(back.theme).toBe("t5-kinetic");
    expect(back.variant.overrides[token]).toBe("#123456");
  });

  it("falls back on garbage, unknown themes and throwing storage", () => {
    expect(parseAppearance("{nope", MANIFESTS).theme).toBe(DEFAULT_THEME);
    expect(parseAppearance(JSON.stringify({ theme: "evil" }), MANIFESTS).theme).toBe(DEFAULT_THEME);
    const throwing: StorageLike = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    expect(loadAppearance(throwing, MANIFESTS).theme).toBe(DEFAULT_THEME);
    expect(() => saveAppearance(throwing, selectTheme(MANIFESTS, DEFAULT_THEME))).not.toThrow();
  });

  it("keeps the theme but drops a variant that fails validation", () => {
    const raw = JSON.stringify({ theme: "t2-artwork", variant: { theme: "t2-artwork", contract: 1, layout: "card", overrides: {}, hidden: [] } });
    const a = parseAppearance(raw, MANIFESTS);
    expect(a.theme).toBe("t2-artwork");
    expect(a.variant.contract).not.toBe(1);
  });

  it("drops injected override values", () => {
    const base = selectTheme(MANIFESTS, DEFAULT_THEME);
    base.variant.overrides["--mp-bg"] = "url(http://x)";
    const a = parseAppearance(JSON.stringify(base), MANIFESTS);
    expect(a.variant.overrides["--mp-bg"]).toBeUndefined();
  });

  it("switching theme clears the previous theme's overrides", () => {
    expect(selectTheme(MANIFESTS, "t3-pill").variant.overrides).toEqual({});
    expect(selectTheme(MANIFESTS, "missing").theme).toBe(DEFAULT_THEME);
  });
});

describe("companion setting", () => {
  it("is off, with the default species and palette and nothing worn, when nothing is stored (opt-in)", () => {
    expect(loadAppearance(memory(), MANIFESTS).companion).toEqual({ on: false, skin: DEFAULT_SKIN, palette: "default", accessory: null });
  });

  it("keeps old saved data valid: an appearance saved before the companion existed loads with it off", () => {
    const old = JSON.stringify({ theme: "t5-kinetic", variant: selectTheme(MANIFESTS, "t5-kinetic").variant });
    const a = parseAppearance(old, MANIFESTS);
    expect(a.theme).toBe("t5-kinetic");
    expect(a.companion).toEqual(defaultCompanion());
  });

  it("keeps a companion saved before accessories (D2c) as it was, wearing nothing", () => {
    const companion = { on: true, skin: "cassette", palette: "chrome" };
    expect(parseAppearance(JSON.stringify({ theme: DEFAULT_THEME, companion }), MANIFESTS).companion).toEqual({ ...companion, accessory: null });
  });

  it("round-trips on, a species, one of its palettes and one of its accessories", () => {
    const store = memory();
    const skin = "bookworm";
    const palette = Object.keys(SKINS[skin].palettes).find((p) => p !== "default") ?? "default";
    const accessory = Object.keys(SKINS[skin].accessories!)[1];
    const a = selectTheme(MANIFESTS, "t2-artwork", { on: true, skin, palette, accessory });
    saveAppearance(store, a);
    expect(loadAppearance(store, MANIFESTS).companion).toEqual({ on: true, skin, palette, accessory });
  });

  it("survives a theme switch, unlike the variant", () => {
    const on = { on: true, skin: "cassette", palette: "default", accessory: "scarf" };
    expect(selectTheme(MANIFESTS, "t3-pill", on).companion).toEqual(on);
  });

  it("survives a broken theme or variant", () => {
    const companion = { on: true, skin: "pilcrow", palette: "default", accessory: "bow" };
    expect(parseAppearance(JSON.stringify({ theme: "evil", companion }), MANIFESTS).companion).toEqual(companion);
    const bad = { theme: "t5-kinetic", variant: { nonsense: 1 }, companion };
    const a = parseAppearance(JSON.stringify(bad), MANIFESTS);
    expect(a.theme).toBe("t5-kinetic");
    expect(a.companion).toEqual(companion);
  });

  it("falls back field by field on unknown skins, palettes, accessories and non-boolean on", () => {
    const parse = (c: unknown) => parseAppearance(JSON.stringify({ theme: DEFAULT_THEME, companion: c }), MANIFESTS).companion;
    expect(parse({ on: "yes", skin: "evil", palette: "x", accessory: "beanie" })).toEqual(defaultCompanion());
    expect(parse({ on: true, skin: "bookworm", palette: "no-such-palette" })).toEqual({ on: true, skin: "bookworm", palette: "default", accessory: null });
    expect(parse({ on: true, skin: "__proto__" })).toEqual({ on: true, skin: DEFAULT_SKIN, palette: "default", accessory: null });
    // An accessory belongs to its species: one the skin doesn't have, or anything not an id, is nothing worn.
    expect(parse({ on: true, skin: "cassette", palette: "mint", accessory: "crown" })).toEqual({ on: true, skin: "cassette", palette: "mint", accessory: null });
    expect(parse({ on: true, skin: "test-dummy", accessory: "beanie" }).accessory).toBeNull();
    expect(parse({ on: true, skin: "pilcrow", accessory: "__proto__" }).accessory).toBeNull();
    expect(parse({ on: true, skin: "pilcrow", accessory: 3 }).accessory).toBeNull();
    expect(parse("junk")).toEqual(defaultCompanion());
    expect(parse(null)).toEqual(defaultCompanion());
  });
});

describe("pickCompanion (C6a, D2c)", () => {
  const off = { on: false, skin: "pilcrow", palette: "ink", accessory: null };
  it("picks the species, turned on, keeping a palette it also has and otherwise its default", () => {
    expect(pickCompanion(off, "pilcrow", "marker")).toEqual({ on: true, skin: "pilcrow", palette: "marker", accessory: null });
    expect(pickCompanion(off, "bookworm")).toEqual({ on: true, skin: "bookworm", palette: "default", accessory: null }); // no "ink"
    expect(pickCompanion({ ...off, palette: "default" }, "cassette")).toEqual({ on: true, skin: "cassette", palette: "default", accessory: null });
    expect(pickCompanion(off, "cassette", "chrome")).toEqual({ on: true, skin: "cassette", palette: "chrome", accessory: null });
    expect(pickCompanion(off, "cassette", "kraft")).toEqual({ on: true, skin: "cassette", palette: "default", accessory: null });
  });
  it("picks an accessory, turned on; another species keeps it if it has one by that id; null takes it off", () => {
    const worn = pickCompanion(off, "pilcrow", "ink", "beanie");
    expect(worn).toEqual({ on: true, skin: "pilcrow", palette: "ink", accessory: "beanie" });
    expect(pickCompanion(worn, "cassette")).toEqual({ on: true, skin: "cassette", palette: "default", accessory: "beanie" });
    expect(pickCompanion(worn, "test-dummy").accessory, "the dummy has none").toBeNull();
    expect(pickCompanion(worn, "pilcrow", "ink", null)).toEqual({ on: true, skin: "pilcrow", palette: "ink", accessory: null });
    expect(pickCompanion(off, "pilcrow", "ink", "crown").accessory).toBeNull();
  });
  it("an unknown species changes nothing", () => {
    expect(pickCompanion(off, "dragon", "default")).toBe(off);
  });
});
