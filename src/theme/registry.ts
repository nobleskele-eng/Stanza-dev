// Every first-party theme's manifest, keyed by id. Production code needs this (the dev
// harness used to keep its own copy); user-folder themes arrive with the Rust loader (Phase 4).
import t1Json from "../../themes/t1-default/theme.json";
import t2Json from "../../themes/t2-artwork/theme.json";
import t3Json from "../../themes/t3-pill/theme.json";
import t4Json from "../../themes/t4-extreme/theme.json";
import t5Json from "../../themes/t5-kinetic/theme.json";
import type { ThemeManifest } from "./variant";

export const DEFAULT_THEME = "t1-default";

export const MANIFESTS: Record<string, ThemeManifest> = {
  "t1-default": t1Json as ThemeManifest,
  "t2-artwork": t2Json as ThemeManifest,
  "t3-pill": t3Json as ThemeManifest,
  "t4-extreme": t4Json as ThemeManifest,
  "t5-kinetic": t5Json as ThemeManifest,
};
