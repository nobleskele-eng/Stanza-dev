import { describe, expect, it } from "vitest";
import {
  APPEARANCE_STORAGE_KEY,
  loadAppearance,
  defaultCompanion,
  parseAppearance,
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
  it("is off, with the default species and palette, when nothing is stored (opt-in)", () => {
    expect(loadAppearance(memory(), MANIFESTS).companion).toEqual({ on: false, skin: DEFAULT_SKIN, palette: "default" });
  });

  it("keeps old saved data valid: an appearance saved before the companion existed loads with it off", () => {
    const old = JSON.stringify({ theme: "t5-kinetic", variant: selectTheme(MANIFESTS, "t5-kinetic").variant });
    const a = parseAppearance(old, MANIFESTS);
    expect(a.theme).toBe("t5-kinetic");
    expect(a.companion).toEqual(defaultCompanion());
  });

  it("round-trips on, a species and one of its palettes", () => {
    const store = memory();
    const skin = "bookworm";
    const palette = Object.keys(SKINS[skin].palettes).find((p) => p !== "default") ?? "default";
    const a = selectTheme(MANIFESTS, "t2-artwork", { on: true, skin, palette });
    saveAppearance(store, a);
    expect(loadAppearance(store, MANIFESTS).companion).toEqual({ on: true, skin, palette });
  });

  it("survives a theme switch, unlike the variant", () => {
    const on = { on: true, skin: "cassette", palette: "default" };
    expect(selectTheme(MANIFESTS, "t3-pill", on).companion).toEqual(on);
  });

  it("survives a broken theme or variant", () => {
    const companion = { on: true, skin: "pilcrow", palette: "default" };
    expect(parseAppearance(JSON.stringify({ theme: "evil", companion }), MANIFESTS).companion).toEqual(companion);
    const bad = { theme: "t5-kinetic", variant: { nonsense: 1 }, companion };
    const a = parseAppearance(JSON.stringify(bad), MANIFESTS);
    expect(a.theme).toBe("t5-kinetic");
    expect(a.companion).toEqual(companion);
  });

  it("falls back field by field on unknown skins, palettes and non-boolean on", () => {
    const parse = (c: unknown) => parseAppearance(JSON.stringify({ theme: DEFAULT_THEME, companion: c }), MANIFESTS).companion;
    expect(parse({ on: "yes", skin: "evil", palette: "x" })).toEqual(defaultCompanion());
    expect(parse({ on: true, skin: "bookworm", palette: "no-such-palette" })).toEqual({ on: true, skin: "bookworm", palette: "default" });
    expect(parse({ on: true, skin: "__proto__" })).toEqual({ on: true, skin: DEFAULT_SKIN, palette: "default" });
    expect(parse("junk")).toEqual(defaultCompanion());
    expect(parse(null)).toEqual(defaultCompanion());
  });
});
