import { describe, expect, it } from "vitest";
import { flapAlphabet, graphemes, isFlapSafe, padPage, paginate } from "./flap";

const strip = (s: string) => s.replace(/\s+/g, "");

describe("paginate", () => {
  it("keeps a short title on one page", () => {
    expect(paginate("Blue Monday", 12)).toEqual(["Blue Monday"]);
  });

  it("wraps at word boundaries and never exceeds the column count", () => {
    const pages = paginate("Bohemian Rhapsody Live Version", 10);
    expect(pages).toEqual(["Bohemian", "Rhapsody", "Live", "Version"]);
    for (const p of pages) expect(graphemes(p).length).toBeLessThanOrEqual(10);
  });

  it("packs several words onto one page when they fit", () => {
    expect(paginate("An Old Song Now", 10)).toEqual(["An Old", "Song Now"]);
  });

  it("hard-splits a word longer than a page", () => {
    expect(paginate("Supercalifragilistic", 8)).toEqual(["Supercal", "ifragili", "stic"]);
  });

  it("never loses or adds a character (spaces aside), for awkward inputs", () => {
    const inputs = [
      "FIXTURE-ONLY-DEV-BUILD Track Title",
      "夜に駆ける —élève",
      "  leading   and    trailing  ",
      "x".repeat(97),
      "a b c d e f g h i j k l m n o p",
    ];
    for (const cols of [1, 3, 10, 16]) {
      for (const text of inputs) {
        const pages = paginate(text, cols);
        expect(strip(pages.join(""))).toBe(strip(text));
        for (const p of pages) expect(graphemes(p).length).toBeLessThanOrEqual(cols);
      }
    }
  });

  it("counts CJK by character, and an empty title is one empty page", () => {
    expect(paginate("夜に駆ける", 3)).toEqual(["夜に駆", "ける"]);
    expect(paginate("", 10)).toEqual([""]);
    expect(paginate("   ", 10)).toEqual([""]);
  });

  it("rejects a non-positive width", () => {
    expect(() => paginate("x", 0)).toThrow();
  });
});

describe("padPage", () => {
  it("centres within the cells, extra space on the right", () => {
    expect(padPage("ab", 6)).toBe("  ab  ");
    expect(padPage("abc", 6)).toBe(" abc  ");
    expect(padPage("abcdef", 6)).toBe("abcdef");
    expect(graphemes(padPage("夜に", 5)).length).toBe(5);
  });
});

describe("flapAlphabet", () => {
  it("contains a space and only letters from the given pages, upper-cased and de-duplicated", () => {
    const a = flapAlphabet(["Hello", "World"]);
    expect([...a].sort().join("")).toBe(a); // code-point order
    expect(new Set(a).size).toBe(a.length);
    for (const ch of a) expect(ch === " " || "HELOWRD".includes(ch)).toBe(true);
    expect(a).toContain(" ");
    expect(a).not.toContain("h"); // upper-case only
  });

  it("carries non-Latin letters straight through (no substitution)", () => {
    expect(flapAlphabet(["夜に駆ける"])).toEqual(expect.stringContaining("夜"));
  });
});

describe("isFlapSafe", () => {
  it("accepts ordinary Latin, accented and CJK titles", () => {
    for (const t of ["Blue Monday", "Élodie Özdemir", "夜に駆ける", "Rock & Roll #1"]) expect(isFlapSafe(t, 10)).toBe(true);
  });

  it("rejects what the library would garble: astral code points (it reads one UTF-16 unit at a time)", () => {
    expect(isFlapSafe("Party 🎉", 10)).toBe(false); // surrogate pair
    expect(isFlapSafe("𠮷野家", 10)).toBe(false); // astral CJK
  });

  it("upper-casing that changes length is fine because callers upper-case BEFORE paginating/padding", () => {
    expect(isFlapSafe("Straße", 10)).toBe(true); // shown as STRASSE, still 7 single-unit cells
    expect(paginate("Straße".toUpperCase(), 10)).toEqual(["STRASSE"]);
  });
});
