import { describe, expect, it } from "vitest";
import copyMarkdown from "../docs/COPY.md?raw";
import { COPY_LABELS, NEEDS_COPY, copy, lookupCopy, parseCopy, type CopyKey } from "./copy";

describe("parseCopy", () => {
  it("reads approved values", () => {
    const m = parseCopy("- **Name:** Stanza\n- **Idle / nothing playing:** Quiet\r\n");
    expect(m.get("Name")).toBe("Stanza");
    expect(m.get("Idle / nothing playing")).toBe("Quiet");
  });

  it("treats [NEEDS COPY] as missing, including when a draft follows it", () => {
    const m = parseCopy(
      ['- **A:** [NEEDS COPY]', '- **B:** [NEEDS COPY] — draft: "not approved"', "- **C:**", '- **"D" item:** [NEEDS COPY]'].join("\n"),
    );
    expect([...m.keys()]).toEqual([]);
  });

  it("ignores lines that are not entries", () => {
    expect(parseCopy("# Title\n\nprose **bold:** x\n  - **Nested:** y\n").size).toBe(0);
  });
});

describe("lookupCopy", () => {
  it("returns [NEEDS COPY] for absent or unapproved labels, never invented text", () => {
    expect(lookupCopy(new Map(), "idle")).toBe(NEEDS_COPY);
    expect(lookupCopy(new Map([[COPY_LABELS.idle, "Quiet"]]), "idle")).toBe("Quiet");
  });
});

describe("docs/COPY.md", () => {
  it("has an entry for every label the UI asks for (a typo would silently show [NEEDS COPY] forever)", () => {
    for (const [key, label] of Object.entries(COPY_LABELS)) {
      expect(copyMarkdown, `${key}: "${label}"`).toContain(`- **${label}:**`);
    }
  });

  it("the shipped copy() returns only approved COPY.md text or [NEEDS COPY]", () => {
    const approved = new Set(parseCopy(copyMarkdown).values());
    for (const key of Object.keys(COPY_LABELS) as CopyKey[]) {
      const v = copy(key);
      expect(v === NEEDS_COPY || approved.has(v), key).toBe(true);
    }
  });
});
