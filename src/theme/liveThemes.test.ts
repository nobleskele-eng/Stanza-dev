import { describe, expect, it } from "vitest";
import fixtureManifest from "../../dev/fixtures/user-themes/fixture-paper/theme.json";
import rust from "../../src-tauri/src/theme_watch.rs?raw";
import { refreshAppearance, selectTheme } from "./appearance";
import { mergeChanges, oneAtATime, parseThemesChanged, planRescan, THEMES_CHANGED, touches, withTheme, type ThemesChanged } from "./liveThemes";
import { MANIFESTS } from "./registry";
import type { UserTheme, UserThemeScan } from "./userThemes";
import { emptyVariant, type ThemeManifest } from "./variant";

const PAPER = fixtureManifest as unknown as ThemeManifest;
const theme = (id: string, over: Partial<ThemeManifest> = {}): UserTheme => ({
  manifest: { ...PAPER, id, ...over },
  cssUrl: `http://asset.localhost/C%3A/t/${id}/theme.css`,
});
const scan = (themes: UserTheme[], problems: { folder: string; code: string }[] = []): UserThemeScan => ({
  themes: Object.fromEntries(themes.map((t) => [t.manifest.id, t])),
  problems,
});
const changed = (folders: string[], all = false): ThemesChanged => ({ folders, all });

describe("the event", () => {
  it("is the one Rust sends", () => {
    expect(/pub const EVENT: &str = "([^"]+)";/.exec(rust)?.[1]).toBe(THEMES_CHANGED);
  });

  it("takes Rust's payload; anything else means any theme may have changed", () => {
    expect(parseThemesChanged({ folders: ["paper", "ink"], all: false })).toEqual(changed(["paper", "ink"]));
    expect(parseThemesChanged({ folders: ["paper", 3, null], all: true })).toEqual(changed(["paper"], true));
    for (const bad of [null, "paper", [], { folders: "paper" }, {}]) expect(parseThemesChanged(bad)).toEqual(changed([], true));
  });

  it("touches a theme by its folder, or every theme", () => {
    expect(touches(changed(["paper"]), "paper")).toBe(true);
    expect(touches(changed(["paper"]), "ink")).toBe(false);
    expect(touches(changed([], true), "ink")).toBe(true);
    expect(mergeChanges(changed(["paper", "ink"]), changed(["ink", "ash"]))).toEqual(changed(["ash", "ink", "paper"]));
    expect(mergeChanges(changed(["paper"]), changed([], true))).toEqual(changed(["paper"], true));
  });
});

describe("withTheme", () => {
  it("puts a theme back in folder order", () => {
    const out = withTheme({ ash: theme("ash"), zinc: theme("zinc") }, "paper", theme("paper"));
    expect(Object.keys(out)).toEqual(["ash", "paper", "zinc"]);
  });
});

describe("planRescan", () => {
  const paper = theme("fixture-paper");
  const paper2 = theme("fixture-paper", { name: "Fixture paper, edited (FIXTURE-ONLY-DEV-BUILD)" });
  const ink = theme("fixture-ink");

  it("a bundled theme on screen: the menu follows the folder, nothing else", () => {
    expect(planRescan({ "fixture-paper": paper }, scan([ink]), "t1-default", changed([], true))).toEqual({
      offer: { "fixture-ink": ink },
      onScreen: { kind: "keep" },
    });
  });

  it("the theme on screen, edited and still good: reload it with its new version", () => {
    const plan = planRescan({ "fixture-paper": paper, "fixture-ink": ink }, scan([ink, paper2]), "fixture-paper", changed(["fixture-paper"]));
    expect(plan).toEqual({ offer: { "fixture-ink": ink, "fixture-paper": paper2 }, onScreen: { kind: "reload", theme: paper2 } });
    // `all` touches it too.
    expect(planRescan({ "fixture-paper": paper }, scan([paper]), "fixture-paper", changed([], true)).onScreen.kind).toBe("reload");
  });

  it("another theme edited: the one on screen stays exactly as loaded", () => {
    const newer = theme("fixture-paper", { window: { width: 300, height: 600 } });
    const plan = planRescan({ "fixture-paper": paper }, scan([newer, ink]), "fixture-paper", changed(["fixture-ink"]));
    expect(plan.onScreen).toEqual({ kind: "keep" });
    expect(plan.offer["fixture-paper"]).toBe(paper);
    expect(plan.offer["fixture-ink"]).toBe(ink); // added
  });

  it("the theme on screen now fails a check: it stays, as last loaded, still offered", () => {
    const plan = planRescan({ "fixture-paper": paper }, scan([ink], [{ folder: "fixture-paper", code: "not-json" }]), "fixture-paper", changed(["fixture-paper"]));
    expect(plan).toEqual({ offer: { "fixture-ink": ink, "fixture-paper": paper }, onScreen: { kind: "stale" } });
  });

  it("the theme on screen is gone: the default takes over (the caller's job), and it isn't offered", () => {
    expect(planRescan({ "fixture-paper": paper, "fixture-ink": ink }, scan([ink]), "fixture-paper", changed(["fixture-paper"]))).toEqual({
      offer: { "fixture-ink": ink },
      onScreen: { kind: "gone" },
    });
  });

  it("a theme not on screen that breaks or goes simply leaves the menu", () => {
    const plan = planRescan({ "fixture-paper": paper, "fixture-ink": ink }, scan([paper], [{ folder: "fixture-ink", code: "no-css" }]), "fixture-paper", changed(["fixture-ink"]));
    expect(plan).toEqual({ offer: { "fixture-paper": paper }, onScreen: { kind: "keep" } });
  });
});

describe("oneAtATime", () => {
  it("runs one change at a time and merges what arrives meanwhile into one more run", async () => {
    const runs: ThemesChanged[] = [];
    const gates: (() => void)[] = [];
    const run = oneAtATime(async (c) => {
      runs.push(c);
      await new Promise<void>((resolve) => gates.push(resolve));
    });
    run(changed(["paper"]));
    run(changed(["ink"]));
    run(changed(["ash"]));
    expect(runs).toEqual([changed(["paper"])]);
    gates.shift()!();
    await new Promise((r) => setTimeout(r, 0));
    expect(runs).toEqual([changed(["paper"]), changed(["ash", "ink"])]);
    gates.shift()!();
    await new Promise((r) => setTimeout(r, 0));
    expect(runs).toHaveLength(2);
    // Idle again: the next change runs at once.
    run(changed([], true));
    expect(runs).toHaveLength(3);
  });

  it("a run that throws doesn't stop the next", async () => {
    const runs: string[] = [];
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...a: unknown[]) => void errors.push(a);
    try {
      const run = oneAtATime(async (c) => {
        runs.push(c.folders.join());
        if (c.folders[0] === "bad") throw new Error("boom");
      });
      run(changed(["bad"]));
      await new Promise((r) => setTimeout(r, 0));
      run(changed(["good"]));
      await new Promise((r) => setTimeout(r, 0));
      expect(runs).toEqual(["bad", "good"]);
      expect(errors).toHaveLength(1);
    } finally {
      console.error = original;
    }
  });
});

describe("refreshAppearance (a new theme.json for the theme on screen)", () => {
  const before: ThemeManifest = { ...PAPER, layout: "card", layouts: ["pill"] };
  const companion = { on: true, skin: "cassette", palette: "default", accessory: null };
  const all = mergeManifests({ "fixture-paper": before });

  it("the theme as shipped stays as shipped: a new default layout shows", () => {
    const a = selectTheme(all, "fixture-paper", companion);
    const after = { ...before, layout: "pill" as const, layouts: ["card" as const] };
    expect(refreshAppearance(a, before, after)).toEqual({ ...a, variant: emptyVariant(after) });
    expect(refreshAppearance(a, before, after).companion).toBe(companion);
  });

  it("nothing that matters changed: the same object back", () => {
    const a = selectTheme(all, "fixture-paper", companion);
    expect(refreshAppearance(a, before, { ...before, name: "Renamed (FIXTURE-ONLY-DEV-BUILD)" })).toBe(a);
  });

  it("a chosen layout the new theme.json still offers is kept; one it doesn't is dropped", () => {
    const a = { ...selectTheme(all, "fixture-paper", companion) };
    a.variant = { ...a.variant, layout: "pill" };
    expect(refreshAppearance(a, before, { ...before, layouts: ["pill", "strip"] })).toBe(a);
    const after = { ...before, layouts: undefined };
    expect(refreshAppearance(a, before, after).variant).toEqual(emptyVariant(after));
  });
});

/** The bundled registry plus the given manifests (enough for selectTheme). */
function mergeManifests(extra: Record<string, ThemeManifest>) {
  return { ...MANIFESTS, ...extra };
}
