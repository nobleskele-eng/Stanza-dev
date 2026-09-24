import { describe, expect, it } from "vitest";
import doc from "../../docs/THEME_CONTRACT.md?raw";
import { ART_FILTER_IDS } from "../fx/artFilter";
import { CONTRACT_VERSION, EFFECT_KEYS, TEXT_FX } from "./variant";

// Keeps docs/THEME_CONTRACT.md honest about the effect layer (design round 2, step 7). The heavy
// doc-vs-DOM comparisons (Parts / Root) live in e2e/contract.spec.ts; these are the ones that need no browser.

/** The text of one `## ` section (or `### `), up to the next heading of the same or higher level. */
function section(title: string): string {
  const start = doc.indexOf(`\n## ${title}`);
  expect(start, `section "${title}" exists`).toBeGreaterThan(-1);
  const rest = doc.slice(start + 1);
  const end = rest.indexOf("\n## ", 3);
  return end === -1 ? rest : rest.slice(0, end);
}
const bullet = (sec: string, startsWith: string): string => {
  const lines = sec.split("\n");
  const i = lines.findIndex((l) => l.startsWith(startsWith));
  expect(i, `bullet starting ${startsWith}`).toBeGreaterThan(-1);
  const out = [lines[i]];
  for (let j = i + 1; j < lines.length && (lines[j].startsWith("  ") || lines[j] === ""); j++) out.push(lines[j]);
  return out.join("\n");
};

describe("THEME_CONTRACT.md tracks the effect layer", () => {
  it("states the current contract version and has a changelog entry for it", () => {
    expect(doc).toContain(`**Contract version: ${CONTRACT_VERSION}**`);
    expect(doc).toMatch(new RegExp(`- \\*\\*v${CONTRACT_VERSION} \\(\\d{4}-\\d{2}-\\d{2}\\):`));
  });

  it("documents a data-fx-<key> Root attribute for every effect key the variant model knows", () => {
    const root = section("Root");
    for (const key of EFFECT_KEYS) expect(root, `data-fx-${key}`).toContain(`- \`data-fx-${key}\``);
  });

  it("lists every text-effect value on the data-fx-title bullet", () => {
    const b = bullet(section("Root"), "- `data-fx-title`");
    for (const v of TEXT_FX) expect(b, v).toContain(v);
  });

  it("documents every app-defined artwork filter id on the .mp-fx-filters part", () => {
    const b = bullet(section("Parts"), "- `.mp-fx-filters`");
    for (const id of Object.values(ART_FILTER_IDS)) expect(b, id).toContain(`#${id}`);
  });

  it("documents the split-flap tile tokens and the simulated beat variable", () => {
    expect(section("Theme tokens (theme-authored)")).toEqual(expect.stringContaining("--mp-flap-bg"));
    for (const t of ["--mp-flap-bg", "--mp-flap-fg", "--mp-flap-edge"]) expect(doc).toContain(t);
    expect(section("App-provided variables (never theme-authored, never editable)")).toContain("--mp-beat");
  });

  it("documents the variant effects keys and values, and the theme.json `fx` field", () => {
    const variants = section("Variants (customizer, D14)");
    for (const key of EFFECT_KEYS) expect(variants, key).toContain(key);
    for (const v of TEXT_FX) expect(variants, v).toContain(v);
    expect(section("`theme.json`")).toContain("| `fx` |");
  });

  it("every top-level theme.json field of every shipped theme has a row in the field table", () => {
    const themes = import.meta.glob("../../themes/*/theme.json", { eager: true, import: "default" }) as Record<string, Record<string, unknown>>;
    const table = section("`theme.json`");
    const documented = new Set(
      table
        .split("\n")
        .filter((l) => l.startsWith("| `"))
        .flatMap((l) => [...l.split("|")[1].matchAll(/`([a-zA-Z]+)`/g)].map((m) => m[1])),
    );
    for (const [file, json] of Object.entries(themes)) {
      for (const key of Object.keys(json)) expect(documented.has(key), `${file}: field \`${key}\` is undocumented`).toBe(true);
    }
  });

  it("every --mp-* custom property the effect and structure code reads or writes appears in the doc", () => {
    const sources = import.meta.glob(["../fx/*.tsx", "../fx/*.ts", "../fx/*.css", "./structure.css", "./guard.css"], {
      eager: true,
      query: "?raw",
      import: "default",
    }) as Record<string, string>;
    const used = new Set<string>();
    for (const [file, text] of Object.entries(sources)) {
      if (/\.test\.ts$/.test(file)) continue;
      for (const m of text.matchAll(/--mp-[a-z0-9-]+/g)) used.add(m[0]);
    }
    expect(used.size).toBeGreaterThan(8); // the scan itself works
    // `--mp-art-N` is documented as a family; per-instance names are covered by the `--mp-art-1` mention.
    const missing = [...used].filter((v) => !doc.includes(v));
    expect(missing, `undocumented custom properties: ${missing.join(", ")}`).toEqual([]);
  });
});
