import { describe, expect, it } from "vitest";
import fixtureManifest from "../../dev/fixtures/user-themes/fixture-paper/theme.json";
import rust from "../../src-tauri/src/themes.rs?raw";
import { MANIFESTS } from "./registry";
import { assetUrl, mergeManifests, parseUserManifest, parseUserThemes, themeSheetText } from "./userThemes";
import { CONTRACT_VERSION } from "./variant";

const BASE = "http://asset.localhost/";
const PATH = String.raw`C:\Users\a b\AppData\Roaming\com.stanza.app\themes\fixture-paper\theme.css`;
const good = () => JSON.parse(JSON.stringify(fixtureManifest)) as Record<string, unknown>;
const ok = (manifest: unknown = good(), folder = "fixture-paper", css = PATH) => ({ kind: "ok", folder, manifest, css });

describe("assetUrl", () => {
  it("keeps the folders as path segments, so a relative url() stays in the theme's folder", () => {
    const url = assetUrl(PATH, BASE);
    expect(url).toBe("http://asset.localhost/C%3A/Users/a%20b/AppData/Roaming/com.stanza.app/themes/fixture-paper/theme.css");
    expect(new URL("bg.svg", url).href).toBe("http://asset.localhost/C%3A/Users/a%20b/AppData/Roaming/com.stanza.app/themes/fixture-paper/bg.svg");
    expect(new URL("fonts/x.woff2", url).pathname).toMatch(/\/fixture-paper\/fonts\/x\.woff2$/);
  });

  it("encodes what could break out of a segment or the url(\"…\") around it", () => {
    expect(assetUrl(String.raw`C:\t\a"b\c#d?e.css`, BASE)).toBe("http://asset.localhost/C%3A/t/a%22b/c%23d%3Fe.css");
  });
});

describe("parseUserManifest", () => {
  it("takes the fixture theme, with only the fields the app reads", () => {
    expect(parseUserManifest(good(), "fixture-paper")).toEqual({
      manifest: { id: "fixture-paper", name: "Fixture paper (FIXTURE-ONLY-DEV-BUILD)", contract: CONTRACT_VERSION, layout: "card", window: { width: 280, height: 507 } },
    });
  });

  it("has a code for every way a theme.json can be wrong", () => {
    const code = (patch: Record<string, unknown>, folder = "fixture-paper") => {
      const m = { ...good(), ...patch };
      for (const [k, v] of Object.entries(patch)) if (v === undefined) delete m[k];
      const r = parseUserManifest(m, folder);
      return "code" in r ? r.code : "ok";
    };
    expect(parseUserManifest([1], "x")).toEqual({ code: "not-object" });
    expect(code({ id: undefined })).toBe("bad-id");
    expect(code({ id: "Fixture" })).toBe("bad-id");
    expect(code({}, "other")).toBe("id-not-folder");
    expect(code({ name: undefined })).toBe("bad-name");
    expect(code({ name: "  " })).toBe("bad-name");
    expect(code({ name: "a\u0007b" })).toBe("bad-name");
    expect(code({ name: "x".repeat(81) })).toBe("bad-name");
    expect(code({ contract: CONTRACT_VERSION - 1 })).toBe("contract-mismatch");
    expect(code({ layout: "grid" })).toBe("bad-layout");
    expect(code({ layouts: ["card", 3] })).toBe("bad-layout");
    expect(code({ window: { width: 280 } })).toBe("bad-window");
    expect(code({ window: { width: 280, height: 9000 } })).toBe("bad-window");
    expect(code({ fx: { shapes: "yes" } })).toBe("bad-fx");
    expect(code({ companion: { shelf: { side: "up", beside: ".mp-artwork" } } })).toBe("bad-companion");
    expect(code({ controls: { "--mp-progress": { type: "number" } } })).toBe("bad-controls"); // app-provided
    expect(code({ controls: { "--mp-bg": { type: "colour" } } })).toBe("bad-controls");
    expect(code({ controls: { "--mp-bg": { type: "color", url: "x" } } })).toBe("bad-controls");
  });

  it("keeps valid optional fields: fx, a shelf, controls, extra layouts", () => {
    const r = parseUserManifest(
      {
        ...good(),
        layouts: ["strip"],
        fx: { shapes: true, title: "ripple" },
        companion: { shelf: { side: "left", beside: ".mp-source-badge" } },
        controls: { "--mp-bg": { type: "color" }, "--mp-radius-window": { type: "length", min: 0, max: 32 } },
      },
      "fixture-paper",
    );
    expect(r).toMatchObject({
      manifest: {
        layouts: ["strip"],
        fx: { shapes: true, title: "ripple" },
        companion: { shelf: { side: "left", beside: ".mp-source-badge" } },
        controls: { "--mp-bg": { type: "color" }, "--mp-radius-window": { type: "length", min: 0, max: 32 } },
      },
    });
  });

  it("names it with the trimmed name, the menu's only text for it", () => {
    expect(parseUserManifest({ ...good(), name: "  Paper  " }, "fixture-paper")).toMatchObject({ manifest: { name: "Paper" } });
  });
});

describe("parseUserThemes", () => {
  it("offers good themes in folder order, with their CSS as an asset URL", () => {
    const second = { ...good(), id: "zz-paper" };
    const { themes, problems } = parseUserThemes([ok(), ok(second, "zz-paper", PATH.replace("fixture-paper", "zz-paper"))], MANIFESTS, BASE);
    expect(problems).toEqual([]);
    expect(Object.keys(themes)).toEqual(["fixture-paper", "zz-paper"]);
    expect(themes["fixture-paper"].cssUrl).toBe(assetUrl(PATH, BASE));
  });

  it("reports Rust's broken folders and its own refusals, and offers none of them", () => {
    const taken = { ...good(), id: "t2-artwork" };
    const { themes, problems } = parseUserThemes(
      [
        { kind: "broken", folder: "a", error: "no-css" },
        { kind: "broken", folder: "b" },
        ok(taken, "t2-artwork"),
        ok({ ...good(), contract: 1 }),
        { kind: "ok", folder: "c", manifest: good() }, // no css
        { kind: "weird", folder: "d" },
        "not an entry",
        { kind: "ok" }, // no folder
      ],
      MANIFESTS,
      BASE,
    );
    expect(themes).toEqual({});
    expect(problems).toEqual([
      { folder: "a", code: "no-css" },
      { folder: "b", code: "broken" },
      { folder: "t2-artwork", code: "id-taken" },
      { folder: "fixture-paper", code: "contract-mismatch" },
      { folder: "c", code: "broken" },
      { folder: "d", code: "broken" },
    ]);
  });

  it("never takes a bundled theme's id", () => {
    for (const id of Object.keys(MANIFESTS)) {
      const { problems } = parseUserThemes([ok({ ...good(), id }, id)], MANIFESTS, BASE);
      expect(problems).toEqual([{ folder: id, code: "id-taken" }]);
    }
  });

  it("anything but a list is no themes", () => {
    for (const raw of [null, undefined, {}, "x", 3]) expect(parseUserThemes(raw, MANIFESTS, BASE)).toEqual({ themes: {}, problems: [] });
  });

  it("refuses a URL that could end the url(\"…\") it goes into", () => {
    const { problems } = parseUserThemes([ok()], MANIFESTS, 'http://asset.localhost/"');
    expect(problems).toEqual([{ folder: "fixture-paper", code: "bad-path" }]);
  });
});

describe("the shell sheet and Rust", () => {
  it("imports the CSS into the theme layer, nothing else", () => {
    // `not all`: loaded but not applied until shown (M3 L3), so a live reload swaps old and new in one frame.
    expect(themeSheetText("http://asset.localhost/C%3A/x/theme.css?v=3")).toBe('@import url("http://asset.localhost/C%3A/x/theme.css?v=3") layer(theme) not all;\n');
  });

  it("lists the bundled themes first, then the user themes, in folder order", () => {
    const { themes } = parseUserThemes([ok(), ok({ ...good(), id: "fixture-zz" }, "fixture-zz")], MANIFESTS, BASE);
    const merged = mergeManifests(MANIFESTS, themes);
    expect(Object.keys(merged)).toEqual([...Object.keys(MANIFESTS), "fixture-paper", "fixture-zz"]);
    expect(merged["fixture-zz"]).toBe(themes["fixture-zz"].manifest);
    expect(Object.keys(MANIFESTS)).not.toContain("fixture-paper"); // a copy: the registry itself is untouched
  });

  it("Rust checks themes against the same contract version", () => {
    expect(/pub const CONTRACT_VERSION: u64 = (\d+);/.exec(rust)?.[1]).toBe(String(CONTRACT_VERSION));
  });
});
