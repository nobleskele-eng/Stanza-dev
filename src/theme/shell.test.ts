import { describe, expect, it } from "vitest";
import doc from "../../docs/THEME_CONTRACT.md?raw";
import guard from "./guard.css?raw";
import shell from "./shell.css?raw";

// The cascade layers (M3 L1, THEME_CONTRACT.md "Layer order"): every stylesheet goes through shell.css, once, into
// its layer. A stylesheet imported anywhere else would be unlayered, and unlayered CSS beats every layer for ordinary
// declarations, so a stray import would silently outrank the themes. The browser side (the guard really winning over
// `!important` from a theme, a user snippet and unlayered CSS) is e2e/contract.spec.ts.

const LAYERS = ["guard", "base", "theme", "user"];

/** `@import "<path>" layer(<name>);` statements, in order. */
const imports = [...shell.matchAll(/@import\s+"([^"]+)"\s+layer\((\w+)\);/g)].map((m) => ({ path: m[1], layer: m[2] }));
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("shell.css", () => {
  it("is read (the test itself works)", () => {
    expect(imports.length).toBeGreaterThan(5);
    expect(guard).toContain(".mp-source-badge");
  });

  it("declares the layer order first, before any import", () => {
    const first = withoutComments(shell).trim().split(";")[0];
    expect(first.replace(/\s+/g, " ")).toBe(`@layer ${LAYERS.join(", ")}`);
  });

  it("declares the order THEME_CONTRACT.md documents", () => {
    const documented = /\n## Layer order[^\n]*\n```\r?\n(@layer [^;]+);/.exec(doc.replace(/\r\n/g, "\n"))?.[1];
    expect(documented).toBe(`@layer ${LAYERS.join(", ")}`);
  });

  it("has nothing but the order and the imports, so no rule of its own is left unlayered", () => {
    const rest = withoutComments(shell)
      .replace(/@layer[^;]+;/, "")
      .replace(/@import\s+"[^"]+"\s+layer\(\w+\);/g, "")
      .trim();
    expect(rest).toBe("");
  });

  it("imports every stylesheet in src/ and every theme's theme.css exactly once", () => {
    const files = Object.keys(import.meta.glob(["../**/*.css", "../../themes/*/theme.css"])).filter((f) => f !== "./shell.css");
    const imported = imports.map((i) => i.path);
    expect(new Set(imported).size, "no stylesheet twice").toBe(imported.length);
    expect([...imported].sort()).toEqual([...files].sort());
  });

  it("puts each stylesheet in its layer: the guard in guard, themes in theme, the app's own in base", () => {
    for (const { path, layer } of imports) {
      const expected = path === "./guard.css" ? "guard" : path.startsWith("../../themes/") ? "theme" : "base";
      expect(layer, path).toBe(expected);
    }
    expect(imports.some((i) => i.layer === "user"), "user snippets arrive at runtime (M3), none are bundled").toBe(false);
  });

  it("is the only stylesheet a module imports (tests may read CSS ?raw)", () => {
    const sources = import.meta.glob(["../**/*.ts", "../**/*.tsx"], { eager: true, query: "?raw", import: "default" }) as Record<string, string>;
    const found: string[] = [];
    for (const [file, text] of Object.entries(sources))
      for (const m of text.matchAll(/^\s*import\s+(?:[^"';]+\s+from\s+)?["']([^"']+\.css)(\?[^"']*)?["']/gm))
        if (!m[2]) found.push(`${file} → ${m[1]}`);
    expect(found).toEqual(["../App.tsx → ./theme/shell.css"]);
  });
});

describe("guard.css", () => {
  it("is all !important: it sits in the first layer, where an ordinary declaration would be the weakest of all", () => {
    const declarations = [...withoutComments(guard).matchAll(/\{([^}]*)\}/g)]
      .flatMap((m) => m[1].split(";"))
      .map((d) => d.trim())
      .filter(Boolean);
    expect(declarations.length).toBeGreaterThan(5);
    expect(declarations.filter((d) => !/!important$/.test(d))).toEqual([]);
  });
});
