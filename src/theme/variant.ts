// Variant data model + validation (docs/PLAN.md §4 "Customizer (a)", D14;
// docs/THEME_CONTRACT.md "Variants"). A variant is a saved set of token overrides,
// a layout choice and hidden parts for ONE theme. Variant files come from disk /
// import, so everything here treats input as untrusted.
//
// Failures are reported as machine codes, never prose: displayed text must come from
// docs/COPY.md (CLAUDE.md), and the variant-import-error string is still [NEEDS COPY].
// The UI maps codes to copy; this module never generates a message.

import type { TextFx } from "../fx/AnimatedText";
import type { FxSettings, Layout } from "../player/Player";
import { WCAG_AA_NORMAL, contrastRatio, parseColor } from "./contrast";

// v2 (2026-09-22): added `data-theme` to Root so multiple themes sharing one layout
// (T4 reuses `card`, same as T2) don't collide when their CSS is loaded together
// (docs/THEME_CONTRACT.md, docs/DECISIONS.md). No part/attribute was renamed, only added.
// v3 (2026-09-22): added `data-title`/`data-artist` to Root so a theme can read the
// real track/artist text in a decorative pseudo-element (`content: attr(...)`), used
// by T1's "Collage" layer. Also purely additive.
// v4 (2026-09-23): opt-in animated effects — `data-fx-*` on Root, the `.mp-shapes` / `.mp-waveform`
// parts, the simulated `--mp-beat` variable, and `effects` in variants. Purely additive.
// v5 (2026-09-23): design round 2 (T5) — `data-fx-flow|morph|debris`, the `splitflap` text effect, `.mp-flow` /
// `.mp-debris` parts, app-provided artwork filter ids, `--mp-flap-*` tokens, theme.json `fx`. Purely additive.
export const CONTRACT_VERSION = 6;

export type ControlType = "color" | "length" | "number" | "font";

export interface ControlSpec {
  type: ControlType;
  min?: number;
  max?: number;
}

/** The subset of theme.json the customizer needs. */
export interface ThemeManifest {
  id: string;
  /** Display name (the theme picker shows it); first-party names are tracked in docs/COPY.md. */
  name: string;
  contract: number;
  layout: Layout;
  /** Extra layouts the theme supports beyond `layout`. */
  layouts?: Layout[];
  /** Native window size in logical px (THEME_CONTRACT.md field table); the production window is set to it. */
  window: { width: number; height: number };
  controls?: Record<string, ControlSpec>;
  /** Effects the theme ships switched on (a variant still overrides). Same rules as `Variant.effects`. */
  fx?: Effects;
}

/**
 * Parts a variant may hide. `.mp-source-badge` and artwork are deliberately absent
 * (D10/C3/C13: badge always visible, artwork appearance never exposed). Must match the
 * `data-hide-<part>` selectors in src/theme/structure.css.
 */
export const HIDEABLE_PARTS = [
  "title",
  "artist",
  "album",
  "progress",
  "time",
  "controls",
  "volume",
  "link-out",
] as const;
export type HideablePart = (typeof HIDEABLE_PARTS)[number];

/**
 * Opt-in animated effects (animated-assets plan, step 4). Same shape the Player takes as its `fx`
 * prop, so an applied variant passes straight through. Every value is an enum or boolean — never
 * free text or CSS — so nothing here can carry an injection. The beat behind shapes/waveform is
 * simulated (src/fx/beat.ts).
 */
export type Effects = FxSettings;
export const TEXT_FX: readonly TextFx[] = ["typewriter", "ripple", "liquid", "splitflap"];
export const EFFECT_KEYS = ["shapes", "waveform", "flow", "morph", "debris", "title", "artist"] as const;

export interface Variant {
  theme: string;
  contract: number;
  layout: Layout;
  overrides: Record<string, string>;
  hidden: HideablePart[];
  /** Omitted when nothing is switched on, so variants saved before effects existed stay valid unchanged. */
  effects?: Effects;
}

export type IssueCode =
  | "not-an-object"
  | "not-an-array"
  | "theme-mismatch"
  | "contract-mismatch"
  | "layout-not-offered"
  | "token-not-editable"
  | "value-not-a-string-or-number"
  | "value-forbidden-characters"
  | "value-wrong-type"
  | "value-out-of-range"
  | "part-not-hideable"
  | "effect-invalid"
  | "unknown-key";

export interface Issue {
  code: IssueCode;
  /** Where in the input, e.g. `overrides.--mp-bg` or `hidden[2]`. */
  path: string;
}

export interface ValidationResult {
  /** null when the file as a whole is unusable (see validateVariant). */
  variant: Variant | null;
  /** Everything that was rejected or dropped. A non-null variant with issues is a partial import. */
  issues: Issue[];
}

const LAYOUTS: readonly Layout[] = ["pill", "card", "strip"];
const KNOWN_KEYS = new Set(["theme", "contract", "layout", "overrides", "hidden", "effects"]);

/**
 * PLAN.md §4 rejects `url(`, `;`, `{`, `}`. Also rejected, since each is a way to smuggle
 * a second declaration, a remote fetch or an escaped `url(` past a naive check:
 * backslash (CSS escapes, e.g. `u\72l(`), `@` (@import), `/*` (comment splicing),
 * `<`/`>` and control characters.
 */
const FORBIDDEN = /url\s*\(|image-set|expression\s*\(|[;{}\\@<>]|\/\*/i;

/** Control characters (C0 range and DEL), checked by code point so the source stays plain text. */
const hasControlChars = (v: string) => [...v].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f);

const COLOR_HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const NUM = String.raw`-?\d+(?:\.\d+)?`;
const COLOR_RGB = new RegExp(
  String.raw`^rgba?\(\s*${NUM}\s*,\s*${NUM}\s*,\s*${NUM}\s*(?:,\s*${NUM}\s*)?\)$`,
  "i",
);
const LENGTH = new RegExp(String.raw`^(${NUM})(?:px|em|rem|%)$`);
const NUMBER = new RegExp(`^(${NUM})$`);
const FONT_NAME = String.raw`(?:"[^"]+"|'[^']+'|[A-Za-z0-9_-]+(?: [A-Za-z0-9_-]+)*)`;
const FONT_LIST = new RegExp(String.raw`^${FONT_NAME}(?:\s*,\s*${FONT_NAME})*$`);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Validates one override against its control spec. Returns the normalized string, or
 * the issue code. For `length` the min/max bound compares the numeric part regardless
 * of unit — the theme author picks a sensible unit by choosing the bounds.
 */
export function validateValue(raw: unknown, spec: ControlSpec): { value: string } | { code: IssueCode } {
  if (typeof raw !== "string" && typeof raw !== "number") return { code: "value-not-a-string-or-number" };
  const untrimmed = String(raw);
  // Checked before trimming so a stray newline/NUL is rejected, not silently normalized away.
  if (FORBIDDEN.test(untrimmed) || hasControlChars(untrimmed)) return { code: "value-forbidden-characters" };
  const value = untrimmed.trim();

  let numeric: number | null = null;
  switch (spec.type) {
    case "color":
      if (!COLOR_HEX.test(value) && !COLOR_RGB.test(value)) return { code: "value-wrong-type" };
      break;
    case "length": {
      const m = LENGTH.exec(value);
      if (!m) return { code: "value-wrong-type" };
      numeric = Number(m[1]);
      break;
    }
    case "number": {
      const m = NUMBER.exec(value);
      if (!m) return { code: "value-wrong-type" };
      numeric = Number(m[1]);
      break;
    }
    case "font":
      if (value.length > 200 || !FONT_LIST.test(value)) return { code: "value-wrong-type" };
      break;
  }

  if (numeric !== null) {
    if (!Number.isFinite(numeric)) return { code: "value-wrong-type" };
    if (spec.min !== undefined && numeric < spec.min) return { code: "value-out-of-range" };
    if (spec.max !== undefined && numeric > spec.max) return { code: "value-out-of-range" };
  }
  return { value };
}

/**
 * Validates an untrusted effects object (a variant's `effects`, or a theme.json `fx`). Enum and
 * boolean values only; invalid entries are dropped and reported, `false`/`null` mean "off" and are
 * stored as absent. `path` prefixes the reported issue paths.
 */
export function validateEffects(input: unknown, path = "effects"): { effects: Effects; issues: Issue[] } {
  const issues: Issue[] = [];
  const effects: Effects = {};
  if (isRecord(input)) {
    for (const [key, raw] of Object.entries(input)) {
      const at = `${path}.${key}`;
      if (key === "shapes" || key === "waveform" || key === "flow" || key === "morph" || key === "debris") {
        if (typeof raw !== "boolean") issues.push({ code: "effect-invalid", path: at });
        else if (raw) effects[key] = true;
      } else if (key === "title" || key === "artist") {
        if (raw === undefined || raw === null) continue;
        if (typeof raw === "string" && (TEXT_FX as readonly string[]).includes(raw)) effects[key] = raw as TextFx;
        else issues.push({ code: "effect-invalid", path: at });
      } else {
        issues.push({ code: "unknown-key", path: at });
      }
    }
  } else if (input !== undefined) {
    issues.push({ code: "not-an-object", path });
  }
  return { effects, issues };
}

/** Layouts a theme offers: its own plus any listed in `layouts`. */
export function offeredLayouts(manifest: ThemeManifest): Layout[] {
  return [...new Set([manifest.layout, ...(manifest.layouts ?? [])])];
}

/** A fresh variant with no overrides — what switching themes resets to (PLAN.md §4). */
export function emptyVariant(manifest: ThemeManifest): Variant {
  return {
    theme: manifest.id,
    contract: CONTRACT_VERSION,
    layout: manifest.layout,
    overrides: {},
    hidden: [],
  };
}

/**
 * Validates an untrusted variant against the theme it claims to belong to.
 * - Unusable as a whole (`variant: null`): not an object, wrong theme, wrong contract
 *   version, or a layout the theme doesn't offer.
 * - Otherwise entry by entry: anything invalid is dropped and reported; unknown
 *   top-level keys are dropped and reported. The returned variant only ever contains
 *   values that passed.
 */
export function validateVariant(input: unknown, manifest: ThemeManifest): ValidationResult {
  const issues: Issue[] = [];
  if (!isRecord(input)) return { variant: null, issues: [{ code: "not-an-object", path: "" }] };

  if (input.theme !== manifest.id) issues.push({ code: "theme-mismatch", path: "theme" });
  if (input.contract !== CONTRACT_VERSION || manifest.contract !== CONTRACT_VERSION) {
    issues.push({ code: "contract-mismatch", path: "contract" });
  }
  if (!LAYOUTS.includes(input.layout as Layout) || !offeredLayouts(manifest).includes(input.layout as Layout)) {
    issues.push({ code: "layout-not-offered", path: "layout" });
  }
  if (issues.length > 0) return { variant: null, issues };

  for (const key of Object.keys(input)) {
    if (!KNOWN_KEYS.has(key)) issues.push({ code: "unknown-key", path: key });
  }

  const overrides: Record<string, string> = {};
  if (isRecord(input.overrides)) {
    for (const [token, raw] of Object.entries(input.overrides)) {
      const path = `overrides.${token}`;
      // Only tokens the theme lists in `controls` are editable. That alone excludes the
      // app-provided variables (--mp-progress, --mp-art-*): a manifest listing one is
      // treated as not editable too, so a bad theme.json can't expose them.
      const spec = Object.prototype.hasOwnProperty.call(manifest.controls ?? {}, token) ? manifest.controls![token] : undefined;
      if (!spec || isAppProvided(token)) {
        issues.push({ code: "token-not-editable", path });
        continue;
      }
      const result = validateValue(raw, spec);
      if ("code" in result) issues.push({ code: result.code, path });
      else overrides[token] = result.value;
    }
  } else if (input.overrides !== undefined) {
    issues.push({ code: "not-an-object", path: "overrides" });
  }

  const hidden: HideablePart[] = [];
  if (Array.isArray(input.hidden)) {
    input.hidden.forEach((part, i) => {
      if (typeof part === "string" && (HIDEABLE_PARTS as readonly string[]).includes(part)) {
        if (!hidden.includes(part as HideablePart)) hidden.push(part as HideablePart);
      } else {
        issues.push({ code: "part-not-hideable", path: `hidden[${i}]` });
      }
    });
  } else if (input.hidden !== undefined) {
    issues.push({ code: "not-an-array", path: "hidden" });
  }

  const fxResult = validateEffects(input.effects);
  issues.push(...fxResult.issues);
  const effects = fxResult.effects;

  return {
    variant: {
      theme: manifest.id,
      contract: CONTRACT_VERSION,
      layout: input.layout as Layout,
      overrides,
      hidden,
      ...(Object.keys(effects).length > 0 && { effects }),
    },
    issues,
  };
}

/** App-provided variables — never editable in any layer (THEME_CONTRACT.md). */
export function isAppProvided(token: string): boolean {
  return token === "--mp-progress" || token === "--mp-art-fg" || /^--mp-art-\d+$/.test(token);
}

/**
 * What to apply to `.mp-root`: CSS custom properties for `style.setProperty`, and the
 * `data-hide-<part>` attribute names. Clearing = removing exactly these.
 */
export function variantToDom(variant: Variant): {
  properties: Record<string, string>;
  hideAttributes: string[];
  /** Pass as the Player's `fx` prop. */
  effects: Effects;
} {
  return {
    properties: { ...variant.overrides },
    hideAttributes: variant.hidden.map((p) => `data-hide-${p}`),
    effects: { ...variant.effects },
  };
}

export interface ContrastReport {
  ratio: number;
  /** false → the customizer shows the contrast warning (copy: still [NEEDS COPY]). */
  passesAA: boolean;
}

/**
 * D14: warn when `--mp-fg` on `--mp-bg` drops below WCAG AA. `defaults` are the theme's
 * own values (read from computed style at runtime); overrides win. Returns null when
 * either color can't be parsed (nothing to warn about).
 */
export function checkVariantContrast(
  variant: Variant,
  defaults: { "--mp-fg": string; "--mp-bg": string },
): ContrastReport | null {
  const fg = parseColor(variant.overrides["--mp-fg"] ?? defaults["--mp-fg"]);
  const bg = parseColor(variant.overrides["--mp-bg"] ?? defaults["--mp-bg"]);
  if (!fg || !bg) return null;
  const ratio = contrastRatio(fg, bg);
  return { ratio, passesAA: ratio >= WCAG_AA_NORMAL };
}
