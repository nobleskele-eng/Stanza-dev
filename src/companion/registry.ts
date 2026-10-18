// Every bundled companion skin, keyed by id (PLAN.md §4b, docs/COMPANION.md). Validated by companion.test.ts; user skins
// arrive later with the loader. C1 ships only the deliberately plain test dummy; the creature itself
// comes from the D1 design round.
import testDummyJson from "../../companions/test-dummy/companion.json";
import type { Skin } from "./skin";

export const DEFAULT_SKIN = "test-dummy";

export const SKINS: Record<string, Skin> = {
  "test-dummy": testDummyJson as Skin,
};
