import { describe, expect, it } from "vitest";
import structureCss from "./structure.css?raw";
import t1Json from "../../themes/t1-default/theme.json";
import {
  CONTRACT_VERSION,
  HIDEABLE_PARTS,
  TEXT_FX,
  checkVariantContrast,
  emptyVariant,
  validateEffects,
  validateValue,
  validateVariant,
  variantToDom,
  type ThemeManifest,
} from "./variant";

const manifest: ThemeManifest = {
  id: "test-theme",
  contract: CONTRACT_VERSION,
  layout: "strip",
  layouts: ["card"],
  window: { width: 400, height: 202 },
  controls: {
    "--mp-bg": { type: "color" },
    "--mp-fg": { type: "color" },
    "--mp-radius-window": { type: "length", min: 0, max: 32 },
    "--mp-scale": { type: "number", min: 0.5, max: 2 },
    "--mp-font-display": { type: "font" },
  },
};

const base = { theme: "test-theme", contract: CONTRACT_VERSION, layout: "strip", overrides: {}, hidden: [] };
const codes = (r: ReturnType<typeof validateVariant>) => r.issues.map((i) => `${i.code}@${i.path}`);

describe("validateValue — by control type", () => {
  it("accepts hex and rgb()/rgba() colors, rejects everything else", () => {
    for (const ok of ["#fff", "#ffff", "#0b0b0d", "#0b0b0dcc", "rgb(1, 2, 3)", "rgba(1,2,3,0.5)"]) {
      expect(validateValue(ok, { type: "color" }), ok).toEqual({ value: ok });
    }
    for (const bad of ["red", "#ff", "#fffff", "rgb(1,2)", "hsl(0,0%,0%)", "var(--x)", ""]) {
      expect(validateValue(bad, { type: "color" }), bad).toEqual({ code: "value-wrong-type" });
    }
  });

  it("checks length units and min/max bounds (inclusive)", () => {
    const spec = { type: "length", min: 0, max: 32 } as const;
    expect(validateValue("16px", spec)).toEqual({ value: "16px" });
    expect(validateValue("0px", spec)).toEqual({ value: "0px" });
    expect(validateValue("32px", spec)).toEqual({ value: "32px" });
    expect(validateValue("33px", spec)).toEqual({ code: "value-out-of-range" });
    expect(validateValue("-1px", spec)).toEqual({ code: "value-out-of-range" });
    expect(validateValue("16", spec)).toEqual({ code: "value-wrong-type" });
    expect(validateValue("16pt", spec)).toEqual({ code: "value-wrong-type" });
  });

  it("accepts numbers as numbers or numeric strings, with bounds", () => {
    const spec = { type: "number", min: 0.5, max: 2 } as const;
    expect(validateValue(1, spec)).toEqual({ value: "1" });
    expect(validateValue("1.25", spec)).toEqual({ value: "1.25" });
    expect(validateValue(2.5, spec)).toEqual({ code: "value-out-of-range" });
    expect(validateValue("abc", spec)).toEqual({ code: "value-wrong-type" });
    expect(validateValue(NaN, spec)).toEqual({ code: "value-wrong-type" });
  });

  it("accepts font-family lists, rejects anything else", () => {
    const spec = { type: "font" } as const;
    for (const ok of ["Georgia", '"Times New Roman", serif', "Courier New, monospace", "'Inter', Arial"]) {
      expect(validateValue(ok, spec), ok).toEqual({ value: ok });
    }
    for (const bad of ["", ",", "Georgia,", "a".repeat(201)]) {
      expect(validateValue(bad, spec), bad).toEqual({ code: "value-wrong-type" });
    }
  });

  it("rejects non string/number values", () => {
    for (const bad of [null, undefined, true, {}, [], ["#fff"]]) {
      expect(validateValue(bad, { type: "color" })).toEqual({ code: "value-not-a-string-or-number" });
    }
  });

  it("rejects every CSS-injection vector with the forbidden-characters code", () => {
    const attacks = [
      "url(https://evil.example/x.png)",
      "URL (x)",
      "#fff; background: red",
      "#fff}body{display:none",
      "red{",
      "u\\72l(x)", // escaped url(
      "@import 'x'",
      "#fff /* c */",
      "image-set(x 1x)",
      "expression(alert(1))",
      "#fff\n",
      String.fromCharCode(0) + "#fff",
      "<b>",
    ];
    for (const attack of attacks) {
      for (const type of ["color", "length", "number", "font"] as const) {
        expect(validateValue(attack, { type }), `${type}: ${JSON.stringify(attack)}`).toEqual({
          code: "value-forbidden-characters",
        });
      }
    }
  });
});

describe("validateVariant — whole-file rules", () => {
  it("accepts a clean variant unchanged", () => {
    const input = {
      ...base,
      layout: "card",
      overrides: { "--mp-bg": "#101010", "--mp-radius-window": "8px" },
      hidden: ["album", "volume"],
    };
    const r = validateVariant(input, manifest);
    expect(r.issues).toEqual([]);
    expect(r.variant).toEqual(input);
  });

  it("rejects non-objects", () => {
    for (const bad of [null, undefined, 3, "x", []]) {
      expect(validateVariant(bad, manifest)).toEqual({ variant: null, issues: [{ code: "not-an-object", path: "" }] });
    }
  });

  it("rejects a variant that belongs to another theme (switching theme drops old overrides)", () => {
    const r = validateVariant({ ...base, theme: "other-theme", overrides: { "--mp-bg": "#000" } }, manifest);
    expect(r.variant).toBeNull();
    expect(codes(r)).toEqual(["theme-mismatch@theme"]);
  });

  it("rejects a contract version mismatch on either side", () => {
    const mismatched = CONTRACT_VERSION + 1;
    expect(codes(validateVariant({ ...base, contract: mismatched }, manifest))).toEqual(["contract-mismatch@contract"]);
    expect(codes(validateVariant(base, { ...manifest, contract: mismatched }))).toEqual(["contract-mismatch@contract"]);
  });

  it("rejects layouts the theme does not offer (or that don't exist)", () => {
    expect(codes(validateVariant({ ...base, layout: "pill" }, manifest))).toEqual(["layout-not-offered@layout"]);
    expect(codes(validateVariant({ ...base, layout: "hexagon" }, manifest))).toEqual(["layout-not-offered@layout"]);
    expect(codes(validateVariant({ ...base, layout: undefined }, manifest))).toEqual(["layout-not-offered@layout"]);
  });

  it("reports every whole-file problem at once", () => {
    const r = validateVariant({ theme: "x", contract: 9, layout: "pill" }, manifest);
    expect(codes(r)).toEqual(["theme-mismatch@theme", "contract-mismatch@contract", "layout-not-offered@layout"]);
  });

  it("drops unknown top-level keys and reports them", () => {
    const r = validateVariant({ ...base, sneaky: "<script>", css: "body{}" }, manifest);
    expect(codes(r)).toEqual(["unknown-key@sneaky", "unknown-key@css"]);
    expect(r.variant).toEqual(base);
    expect(r.variant).not.toHaveProperty("sneaky");
  });

  it("treats missing overrides/hidden as empty, wrong container types as issues", () => {
    expect(validateVariant({ theme: "test-theme", contract: CONTRACT_VERSION, layout: "strip" }, manifest)).toEqual({
      variant: base,
      issues: [],
    });
    const r = validateVariant({ ...base, overrides: [], hidden: {} }, manifest);
    expect(codes(r)).toEqual(["not-an-object@overrides", "not-an-array@hidden"]);
    expect(r.variant).toEqual(base);
  });
});

describe("validateVariant — overrides", () => {
  it("drops only the bad entries and keeps the good ones (partial import)", () => {
    const r = validateVariant(
      {
        ...base,
        overrides: {
          "--mp-bg": "#101010",
          "--mp-fg": "url(https://evil.example)",
          "--mp-radius-window": "99px",
          "--mp-scale": "big",
          "--mp-font-display": "Georgia",
        },
      },
      manifest,
    );
    expect(r.variant?.overrides).toEqual({ "--mp-bg": "#101010", "--mp-font-display": "Georgia" });
    expect(codes(r)).toEqual([
      "value-forbidden-characters@overrides.--mp-fg",
      "value-out-of-range@overrides.--mp-radius-window",
      "value-wrong-type@overrides.--mp-scale",
    ]);
  });

  it("only theme-listed tokens are editable", () => {
    const r = validateVariant({ ...base, overrides: { "--mp-accent": "#f00", "--evil": "1", color: "red" } }, manifest);
    expect(r.variant?.overrides).toEqual({});
    expect(codes(r)).toEqual([
      "token-not-editable@overrides.--mp-accent",
      "token-not-editable@overrides.--evil",
      "token-not-editable@overrides.color",
    ]);
  });

  it("app-provided variables are never editable, even if a theme.json lists them", () => {
    const hostile: ThemeManifest = {
      ...manifest,
      controls: {
        ...manifest.controls,
        "--mp-progress": { type: "number" },
        "--mp-art-1": { type: "color" },
        "--mp-art-3": { type: "color" },
        "--mp-art-fg": { type: "color" },
      },
    };
    const r = validateVariant(
      { ...base, overrides: { "--mp-progress": 1, "--mp-art-1": "#fff", "--mp-art-3": "#fff", "--mp-art-fg": "#fff" } },
      hostile,
    );
    expect(r.variant?.overrides).toEqual({});
    expect(r.issues).toHaveLength(4);
    expect(r.issues.every((i) => i.code === "token-not-editable")).toBe(true);
  });

  it("does not treat Object.prototype keys as editable tokens", () => {
    const r = validateVariant({ ...base, overrides: { constructor: "#fff", toString: "#fff", __proto__x: "#fff" } }, manifest);
    expect(r.variant?.overrides).toEqual({});
    expect(r.issues).toHaveLength(3);
  });

  it("survives a __proto__ key from JSON.parse without polluting anything", () => {
    const parsed = JSON.parse(
      `{"theme":"test-theme","contract":${CONTRACT_VERSION},"layout":"strip","overrides":{"__proto__":{"x":1}}}`,
    );
    const r = validateVariant(parsed, manifest);
    expect(r.variant?.overrides).toEqual({});
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it("returns normalized (trimmed, stringified) values", () => {
    const r = validateVariant({ ...base, overrides: { "--mp-scale": 1.5, "--mp-bg": "  #101010 " } }, manifest);
    expect(r.variant?.overrides).toEqual({ "--mp-scale": "1.5", "--mp-bg": "#101010" });
  });
});

describe("validateVariant — hidden parts", () => {
  it("accepts every hideable part", () => {
    const r = validateVariant({ ...base, hidden: [...HIDEABLE_PARTS] }, manifest);
    expect(r.issues).toEqual([]);
    expect(r.variant?.hidden).toEqual([...HIDEABLE_PARTS]);
  });

  it("never allows hiding the source badge or the artwork (D10)", () => {
    const r = validateVariant({ ...base, hidden: ["source-badge", "artwork", "title", "mp-source-badge", "badge"] }, manifest);
    expect(r.variant?.hidden).toEqual(["title"]);
    expect(codes(r)).toEqual([
      "part-not-hideable@hidden[0]",
      "part-not-hideable@hidden[1]",
      "part-not-hideable@hidden[3]",
      "part-not-hideable@hidden[4]",
    ]);
  });

  it("de-duplicates and rejects non-strings", () => {
    const r = validateVariant({ ...base, hidden: ["title", "title", 5, null] }, manifest);
    expect(r.variant?.hidden).toEqual(["title"]);
    expect(codes(r)).toEqual(["part-not-hideable@hidden[2]", "part-not-hideable@hidden[3]"]);
  });

  it("HIDEABLE_PARTS matches the data-hide-<part> selectors in structure.css", () => {
    const inCss = [...structureCss.matchAll(/data-hide-([a-z-]+)\]/g)].map((m) => m[1]);
    expect([...new Set(inCss)].sort()).toEqual([...HIDEABLE_PARTS].sort());
    expect(inCss).not.toContain("source-badge");
    expect(inCss).not.toContain("artwork");
  });
});

describe("emptyVariant / variantToDom", () => {
  it("emptyVariant is what switching themes resets to and is itself valid", () => {
    const v = emptyVariant(manifest);
    expect(v).toEqual({ theme: "test-theme", contract: CONTRACT_VERSION, layout: "strip", overrides: {}, hidden: [] });
    expect(validateVariant(v, manifest)).toEqual({ variant: v, issues: [] });
  });

  it("maps overrides to properties and hidden parts to data-hide attributes", () => {
    const v = validateVariant({ ...base, overrides: { "--mp-bg": "#101010" }, hidden: ["album", "link-out"] }, manifest).variant!;
    expect(variantToDom(v)).toEqual({
      properties: { "--mp-bg": "#101010" },
      hideAttributes: ["data-hide-album", "data-hide-link-out"],
      effects: {},
    });
  });
});

describe("validateVariant — effects (animated assets, step 4)", () => {
  const withFx = (effects: unknown) => validateVariant({ ...base, effects }, manifest);

  it("a variant with no effects key is unchanged and carries no effects (old files stay valid)", () => {
    const r = validateVariant(base, manifest);
    expect(r.issues).toEqual([]);
    expect(r.variant).toEqual(base);
    expect(r.variant).not.toHaveProperty("effects");
  });

  it("accepts every effect value and round-trips them into the Player's fx shape", () => {
    for (const t of TEXT_FX) {
      const r = withFx({ shapes: true, waveform: true, flow: true, morph: true, debris: true, title: t, artist: t });
      expect(r.issues).toEqual([]);
      expect(r.variant!.effects).toEqual({ shapes: true, waveform: true, flow: true, morph: true, debris: true, title: t, artist: t });
      expect(variantToDom(r.variant!).effects).toEqual({ shapes: true, waveform: true, flow: true, morph: true, debris: true, title: t, artist: t });
    }
  });

  it("TEXT_FX is exactly the implemented text effects", () => {
    expect([...TEXT_FX]).toEqual(["typewriter", "ripple", "liquid", "splitflap"]);
  });

  it("false / empty effects are stored as absent, not as an empty object", () => {
    for (const e of [{}, { shapes: false, waveform: false }, { title: null }]) {
      const r = withFx(e);
      expect(r.issues).toEqual([]);
      expect(r.variant).not.toHaveProperty("effects");
    }
  });

  it("drops invalid values and unknown keys, keeps the valid ones (partial import)", () => {
    const r = withFx({ shapes: "yes", waveform: true, title: "explode", artist: "ripple", confetti: true });
    expect(codes(r).sort()).toEqual(["effect-invalid@effects.shapes", "effect-invalid@effects.title", "unknown-key@effects.confetti"].sort());
    expect(r.variant!.effects).toEqual({ waveform: true, artist: "ripple" });
  });

  it("rejects CSS/markup smuggled through an effect value (enum only, never free text)", () => {
    for (const evil of ["url(https://x)", "ripple;}body{display:none", "<script>", "typewriter ", "TYPEWRITER", "__proto__", 5, ["ripple"], {}]) {
      const r = withFx({ title: evil });
      expect(r.variant).not.toHaveProperty("effects");
      expect(codes(r)).toEqual(["effect-invalid@effects.title"]);
    }
  });

  it("wrong container type is an issue; __proto__ key does not pollute", () => {
    for (const bad of ["x", 3, [], true]) expect(codes(withFx(bad))).toContain("not-an-object@effects");
    const polluted = validateVariant(JSON.parse(`{"theme":"test-theme","contract":${CONTRACT_VERSION},"layout":"strip","effects":{"__proto__":{"shapes":true}}}`), manifest);
    expect(({} as Record<string, unknown>).shapes).toBeUndefined();
    expect(polluted.variant).not.toHaveProperty("effects");
  });
});

describe("checkVariantContrast (D14 AA warning)", () => {
  const defaults = { "--mp-fg": "#f2f0ea", "--mp-bg": "#0b0b0d" };
  const v = (overrides: Record<string, string>) => ({ ...emptyVariant(manifest), overrides });

  it("passes for the theme defaults", () => {
    const r = checkVariantContrast(v({}), defaults)!;
    expect(r.passesAA).toBe(true);
    expect(r.ratio).toBeGreaterThan(15);
  });

  it("warns when an override drops fg on bg below 4.5:1", () => {
    const r = checkVariantContrast(v({ "--mp-fg": "#777777" }), { "--mp-fg": "#f2f0ea", "--mp-bg": "#808080" })!;
    expect(r.passesAA).toBe(false);
  });

  it("uses an overridden background against the default foreground", () => {
    expect(checkVariantContrast(v({ "--mp-bg": "#ffffff" }), defaults)!.passesAA).toBe(false);
  });

  it("returns null when a color can't be parsed", () => {
    expect(checkVariantContrast(v({}), { "--mp-fg": "not-a-color", "--mp-bg": "#000" })).toBeNull();
  });
});

describe("the real T1 theme.json", () => {
  it("declares controls that all validate with the variant rules, and none are app-provided", () => {
    const t1 = t1Json as ThemeManifest;
    expect(t1.contract).toBe(CONTRACT_VERSION);
    expect(Object.keys(t1.controls ?? {}).length).toBeGreaterThan(0);
    for (const token of Object.keys(t1.controls!)) expect(token).toMatch(/^--mp-[a-z-]+$/);
    const r = validateVariant(
      { ...emptyVariant(t1), overrides: { "--mp-bg": "#101010", "--mp-radius-window": "12px", "--mp-art-1": "#fff" } },
      t1,
    );
    expect(codes(r)).toEqual(["token-not-editable@overrides.--mp-art-1"]);
    expect(r.variant?.overrides).toEqual({ "--mp-bg": "#101010", "--mp-radius-window": "12px" });
  });
});

describe("theme.json `fx` defaults", () => {
  const themes = import.meta.glob("../../themes/*/theme.json", { eager: true, import: "default" }) as Record<string, ThemeManifest>;

  it("every shipped theme's fx (if any) validates cleanly with the variant effect rules", () => {
    const entries = Object.entries(themes);
    expect(entries.length).toBeGreaterThanOrEqual(5);
    for (const [file, m] of entries) {
      const r = validateEffects(m.fx);
      expect(r.issues, file).toEqual([]);
      if (m.fx) expect(r.effects, file).toEqual(m.fx); // nothing normalised away: defaults are in canonical form
    }
  });

  it("T5 ships the split-flap title and the flow backdrop", () => {
    const t5 = Object.entries(themes).find(([f]) => f.includes("t5-kinetic"))![1];
    expect(t5.fx).toEqual({ title: "splitflap", flow: true, morph: true, debris: true });
  });

  it("validateEffects rejects non-objects and reports paths with the given prefix", () => {
    expect(validateEffects("x", "fx").issues).toEqual([{ code: "not-an-object", path: "fx" }]);
    expect(validateEffects({ title: "nope" }, "fx").issues).toEqual([{ code: "effect-invalid", path: "fx.title" }]);
    expect(validateEffects(undefined)).toEqual({ effects: {}, issues: [] });
  });
});
