// Persisted appearance: which theme is active and its saved variant (docs/PLAN.md §4,
// "Customizer (a)"). Pure functions over a storage-like object so they're testable without a
// DOM. Stored data is untrusted: anything invalid falls back to the theme's own defaults, and
// this module never produces user-visible text (COPY.md rule).

import { DEFAULT_THEME } from "./registry";
import { emptyVariant, validateVariant, type ThemeManifest, type Variant } from "./variant";

export const APPEARANCE_STORAGE_KEY = "mp.appearance.v1";

export interface Appearance {
  theme: string;
  /** Always valid for `theme`; an empty variant means "the theme as shipped". */
  variant: Variant;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultAppearance(manifests: Record<string, ThemeManifest>, theme = DEFAULT_THEME): Appearance {
  const id = manifests[theme] ? theme : DEFAULT_THEME;
  return { theme: id, variant: emptyVariant(manifests[id]) };
}

/** Switching theme clears the previous theme's overrides (PLAN.md), and unknown ids are refused. */
export function selectTheme(manifests: Record<string, ThemeManifest>, theme: string): Appearance {
  return defaultAppearance(manifests, theme);
}

/** Parse + validate a stored value. Never throws; any problem yields the default theme. */
export function parseAppearance(raw: string | null, manifests: Record<string, ThemeManifest>): Appearance {
  if (!raw) return defaultAppearance(manifests);
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return defaultAppearance(manifests);
  }
  const theme = typeof data === "object" && data !== null ? (data as { theme?: unknown }).theme : undefined;
  if (typeof theme !== "string" || !manifests[theme]) return defaultAppearance(manifests);
  const result = validateVariant((data as { variant?: unknown }).variant, manifests[theme]);
  // Any issue (e.g. a contract bump since it was saved) drops the variant but keeps the theme.
  if (!result.variant || result.issues.length) return defaultAppearance(manifests, theme);
  return { theme, variant: result.variant };
}

export function loadAppearance(storage: StorageLike | null, manifests: Record<string, ThemeManifest>): Appearance {
  try {
    return parseAppearance(storage?.getItem(APPEARANCE_STORAGE_KEY) ?? null, manifests);
  } catch {
    return defaultAppearance(manifests);
  }
}

export function saveAppearance(storage: StorageLike | null, appearance: Appearance): void {
  try {
    storage?.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    // Storage unavailable/full: appearance just won't persist this run.
  }
}
