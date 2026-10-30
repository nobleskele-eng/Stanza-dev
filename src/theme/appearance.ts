// Persisted appearance: which theme is active and its saved variant (docs/PLAN.md §4,
// "Customizer (a)"). Pure functions over a storage-like object so they're testable without a
// DOM. Stored data is untrusted: anything invalid falls back to the theme's own defaults, and
// this module never produces user-visible text (COPY.md rule).

import { DEFAULT_SKIN, SKINS } from "../companion/registry";
import { DEFAULT_THEME } from "./registry";
import { emptyVariant, validateVariant, type ThemeManifest, type Variant } from "./variant";

export const APPEARANCE_STORAGE_KEY = "mp.appearance.v1";

/** The companion (PLAN.md §4b): app-wide, so unlike a variant it survives theme switches. Off until the owner turns it on. */
export interface CompanionSetting {
  on: boolean;
  /** A bundled skin id. */
  skin: string;
  /** One of that skin's palette names. */
  palette: string;
}

export const defaultCompanion = (): CompanionSetting => ({ on: false, skin: DEFAULT_SKIN, palette: "default" });

export interface Appearance {
  theme: string;
  /** Always valid for `theme`; an empty variant means "the theme as shipped". */
  variant: Variant;
  companion: CompanionSetting;
}

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Stored data is untrusted: anything that isn't a known skin and one of its palettes falls back, field by field. */
export function parseCompanion(raw: unknown): CompanionSetting {
  const out = defaultCompanion();
  if (typeof raw !== "object" || raw === null) return out;
  const { on, skin, palette } = raw as { on?: unknown; skin?: unknown; palette?: unknown };
  if (on === true) out.on = true;
  if (typeof skin === "string" && has(SKINS, skin)) {
    out.skin = skin;
    if (typeof palette === "string" && has(SKINS[skin].palettes, palette)) out.palette = palette;
  }
  return out;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultAppearance(
  manifests: Record<string, ThemeManifest>,
  theme = DEFAULT_THEME,
  companion: CompanionSetting = defaultCompanion(),
): Appearance {
  const id = manifests[theme] ? theme : DEFAULT_THEME;
  return { theme: id, variant: emptyVariant(manifests[id]), companion };
}

/** Switching theme clears the previous theme's overrides (PLAN.md), and unknown ids are refused. The companion stays. */
export function selectTheme(manifests: Record<string, ThemeManifest>, theme: string, companion?: CompanionSetting): Appearance {
  return defaultAppearance(manifests, theme, companion);
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
  // The companion is app-wide, so a bad theme or variant never takes it down with them.
  const companion = parseCompanion(typeof data === "object" && data !== null ? (data as { companion?: unknown }).companion : undefined);
  const theme = typeof data === "object" && data !== null ? (data as { theme?: unknown }).theme : undefined;
  if (typeof theme !== "string" || !manifests[theme]) return defaultAppearance(manifests, DEFAULT_THEME, companion);
  const result = validateVariant((data as { variant?: unknown }).variant, manifests[theme]);
  // Any issue (e.g. a contract bump since it was saved) drops the variant but keeps the theme.
  if (!result.variant || result.issues.length) return defaultAppearance(manifests, theme, companion);
  return { theme, variant: result.variant, companion };
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
