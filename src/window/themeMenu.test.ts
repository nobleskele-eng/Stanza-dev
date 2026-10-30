import { Image } from "@tauri-apps/api/image";
import { describe, expect, it } from "vitest";
import { NEEDS_COPY } from "../copy";
import { MANIFESTS } from "../theme/registry";
import type { ThemeManifest } from "../theme/variant";
import { companionMenuItem, themeMenuEntries } from "./themeMenu";

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
