import { describe, expect, it } from "vitest";
import { NEEDS_COPY } from "../copy";
import { MANIFESTS } from "../theme/registry";
import type { ThemeManifest } from "../theme/variant";
import { themeMenuEntries } from "./themeMenu";

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
