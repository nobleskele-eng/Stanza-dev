// User themes (PLAN.md §4 "Loading and hot swap", M3 L2): theme folders a person puts in
// `<app data dir>/themes/<id>/` by hand. Rust finds them and checks the files (src-tauri/src/themes.rs); this module
// checks what Rust sends (untrusted, like everything stored), merges them after the five bundled themes, and loads the
// active one's CSS into the `theme` cascade layer (src/theme/shell.css, M3 L1).
//
// Loading: one `<link>` whose stylesheet is a `blob:` holding `@import url("<theme.css>") layer(theme);`. A `<link>`
// can't be put in a layer itself, and wrapping the CSS text in `@layer theme { … }` would let a stray `}` in it close
// the layer early; an imported sheet is parsed on its own, wholly inside the layer (the S4 spike's method,
// DECISIONS.md 2026-09-17). The order `guard, base, theme, user` was declared by the bundled shell first, so a sheet
// added later joins the existing `theme` layer and can't reorder anything.
//
// Problems are machine codes, never prose (COPY.md rule): "Theme failed to load" is still [NEEDS COPY], and the
// settings window that will show it doesn't exist yet (M3 L4).
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import type { Layout } from "../player/Player";
import {
  CONTRACT_VERSION,
  isAppProvided,
  validateCompanion,
  validateEffects,
  type ControlSpec,
  type ControlType,
  type ThemeManifest,
} from "./variant";

/** What `user_themes` returns per folder (`UserTheme` in src-tauri/src/themes.rs). */
export type UserThemeEntry =
  | { kind: "ok"; folder: string; manifest: unknown; css: string }
  | { kind: "broken"; folder: string; error: string };

export interface UserTheme {
  manifest: ThemeManifest;
  /** theme.css through the asset protocol, shaped so its relative `url()`s resolve inside its folder. */
  cssUrl: string;
}

/** A folder that isn't offered, and why (a code from Rust, or one of this module's). */
export interface UserThemeProblem {
  folder: string;
  code: string;
}

const LAYOUTS: readonly Layout[] = ["pill", "card", "strip"];
const CONTROL_TYPES: readonly ControlType[] = ["color", "length", "number", "font"];
/** Same rules as src-tauri/src/themes.rs `valid_id`: lowercase words of letters and digits joined by single hyphens. */
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const inWindow = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 40 && n <= 1600;

/**
 * The asset-protocol URL of a file, one encoded path segment per folder (`C:/Users/…/themes/paper/theme.css`), so a
 * relative `url(bg.svg)` inside it resolves to the same folder. Tauri's own `convertFileSrc` encodes the whole path
 * as one segment (separators too), which would send every relative URL to the protocol's root.
 */
export function assetUrl(path: string, base: string): string {
  return base + path.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/");
}

function parseControls(raw: unknown): Record<string, ControlSpec> | null {
  if (!isRecord(raw)) return null;
  const out: Record<string, ControlSpec> = {};
  for (const [token, spec] of Object.entries(raw)) {
    if (!/^--[a-z0-9-]+$/.test(token) || isAppProvided(token) || !isRecord(spec)) return null;
    if (!CONTROL_TYPES.includes(spec.type as ControlType)) return null;
    if (Object.keys(spec).some((k) => k !== "type" && k !== "min" && k !== "max")) return null;
    for (const k of ["min", "max"] as const)
      if (spec[k] !== undefined && !(typeof spec[k] === "number" && Number.isFinite(spec[k]))) return null;
    out[token] = { type: spec.type as ControlType, ...(spec.min !== undefined && { min: spec.min as number }), ...(spec.max !== undefined && { max: spec.max as number }) };
  }
  return out;
}

/**
 * One theme.json, untrusted: the fields the app uses, checked, or a code. Strict: an optional field that's there but
 * wrong (`fx`, `companion`, `controls`) refuses the theme rather than quietly running it without, so its author finds
 * out. Fields the app doesn't read yet (`author`, `version`, `colorMode`, `nativeEffect`) are ignored.
 */
export function parseUserManifest(raw: unknown, folder: string): { manifest: ThemeManifest } | { code: string } {
  if (!isRecord(raw)) return { code: "not-object" };
  const { id, name, contract, layout, layouts, window: win, fx, companion, controls } = raw;
  if (typeof id !== "string" || !ID.test(id) || id.length > 40) return { code: "bad-id" };
  if (id !== folder) return { code: "id-not-folder" };
  // Characters below U+0020 and DEL..U+009F: no control characters in a menu label.
  if (typeof name !== "string" || !name.trim() || name.trim().length > 80 || /[\u0000-\u001f\u007f-\u009f]/.test(name)) return { code: "bad-name" };
  if (contract !== CONTRACT_VERSION) return { code: "contract-mismatch" };
  if (!LAYOUTS.includes(layout as Layout)) return { code: "bad-layout" };
  if (layouts !== undefined && !(Array.isArray(layouts) && layouts.every((l) => LAYOUTS.includes(l as Layout)))) return { code: "bad-layout" };
  if (!isRecord(win) || !inWindow(win.width) || !inWindow(win.height)) return { code: "bad-window" };
  const manifest: ThemeManifest = {
    id,
    name: name.trim(),
    contract: CONTRACT_VERSION,
    layout: layout as Layout,
    ...(layouts !== undefined && { layouts: layouts as Layout[] }),
    window: { width: win.width as number, height: win.height as number },
  };
  if (fx !== undefined) {
    const r = validateEffects(fx, "fx");
    if (r.issues.length) return { code: "bad-fx" };
    manifest.fx = r.effects;
  }
  if (companion !== undefined) {
    const r = validateCompanion(companion);
    if (r.issues.length) return { code: "bad-companion" };
    manifest.companion = r.companion;
  }
  if (controls !== undefined) {
    const c = parseControls(controls);
    if (!c) return { code: "bad-controls" };
    manifest.controls = c;
  }
  return { manifest };
}

/**
 * `user_themes`' answer, untrusted, into themes to offer (in folder order, after the bundled ones) and problems.
 * A bundled theme's id can't be taken. `base` is the asset protocol's root (`convertFileSrc("")`).
 */
export function parseUserThemes(
  raw: unknown,
  bundled: Record<string, ThemeManifest>,
  base: string,
): { themes: Record<string, UserTheme>; problems: UserThemeProblem[] } {
  const themes: Record<string, UserTheme> = {};
  const problems: UserThemeProblem[] = [];
  if (!Array.isArray(raw)) return { themes, problems };
  for (const entry of raw as unknown[]) {
    if (!isRecord(entry) || typeof entry.folder !== "string") continue;
    const folder = entry.folder;
    if (entry.kind === "broken") {
      problems.push({ folder, code: typeof entry.error === "string" ? entry.error : "broken" });
      continue;
    }
    if (entry.kind !== "ok" || typeof entry.css !== "string" || !entry.css) {
      problems.push({ folder, code: "broken" });
      continue;
    }
    const parsed = parseUserManifest(entry.manifest, folder);
    if ("code" in parsed) {
      problems.push({ folder, code: parsed.code });
      continue;
    }
    const { manifest } = parsed;
    if (Object.prototype.hasOwnProperty.call(bundled, manifest.id) || themes[manifest.id]) {
      problems.push({ folder, code: "id-taken" });
      continue;
    }
    const cssUrl = assetUrl(entry.css, base);
    // It goes inside url("…") in the shell sheet: nothing that could end the string or the rule.
    if (/["\\\n\r]/.test(cssUrl)) {
      problems.push({ folder, code: "bad-path" });
      continue;
    }
    themes[manifest.id] = { manifest, cssUrl };
  }
  return { themes, problems };
}

/** Asks Rust for the user themes. Outside Tauri, or if the call fails: none. Never rejects. */
export async function loadUserThemes(bundled: Record<string, ThemeManifest>): Promise<Record<string, UserTheme>> {
  if (!isTauri()) return {};
  try {
    const raw = await invoke("user_themes");
    // No folders (the usual case): nothing to parse, and the asset protocol isn't touched.
    if (!Array.isArray(raw) || raw.length === 0) return {};
    const { themes, problems } = parseUserThemes(raw, bundled, convertFileSrc("", "asset"));
    // Codes only, for whoever is writing a theme; the settings window will show them with copy (M3 L4).
    if (problems.length) console.warn("user themes not offered", problems);
    return themes;
  } catch (err) {
    console.error("listing user themes failed", err);
    return {};
  }
}

/** The shell sheet's text: the theme's CSS, imported into the `theme` layer. */
export const themeSheetText = (cssUrl: string) => `@import url("${cssUrl}") layer(theme);\n`;

/** How long a user theme's CSS may take before it counts as failed. */
export const SHEET_TIMEOUT_MS = 5000;

/**
 * Adds the theme's sheet and resolves, with a function that removes it, once it has loaded (the `<link>`'s load waits
 * for the import). Rejects on an error or after SHEET_TIMEOUT_MS, leaving nothing behind.
 */
export function loadThemeSheet(theme: UserTheme, doc: Document = document): Promise<() => void> {
  const url = URL.createObjectURL(new Blob([themeSheetText(theme.cssUrl)], { type: "text/css" }));
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  link.dataset.mpUserTheme = theme.manifest.id;
  const remove = () => {
    link.remove();
    URL.revokeObjectURL(url);
  };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => fail(new Error("timeout")), SHEET_TIMEOUT_MS);
    function fail(err: unknown) {
      clearTimeout(timer);
      remove();
      reject(err);
    }
    link.onload = () => {
      clearTimeout(timer);
      resolve(remove);
    };
    link.onerror = () => fail(new Error("error"));
    doc.head.append(link);
  });
}
