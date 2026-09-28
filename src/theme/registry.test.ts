import { describe, expect, it } from "vitest";
import copyMarkdown from "../../docs/COPY.md?raw";
import { NEEDS_COPY, parseCopy } from "../copy";
import { MANIFESTS } from "./registry";

describe("first-party theme names", () => {
  it("each theme.json `name` matches its docs/COPY.md entry (COPY.md stays the copy inventory)", () => {
    const copy = parseCopy(copyMarkdown);
    for (const [id, manifest] of Object.entries(MANIFESTS)) {
      expect(manifest.id, "registry key").toBe(id);
      expect(manifest.name, id).toBe(copy.get(`Theme name — ${id}`) ?? NEEDS_COPY);
    }
  });
});
