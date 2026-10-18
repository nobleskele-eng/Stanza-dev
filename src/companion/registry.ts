// Every bundled companion skin, keyed by id (PLAN.md §4b, docs/COMPANION.md). Validated by companion.test.ts; user skins
// arrive later with the loader. `test-dummy` is the deliberately plain C1 placeholder. `pilcrow`, `bookworm` and
// `cassette` are the three species from the D1 design round, all kept (scripts/gen-companions.mjs).
import bookwormJson from "../../companions/bookworm/companion.json";
import cassetteJson from "../../companions/cassette/companion.json";
import pilcrowJson from "../../companions/pilcrow/companion.json";
import testDummyJson from "../../companions/test-dummy/companion.json";
import type { Skin } from "./skin";

/** The species shown until the owner picks another (D1, docs/DECISIONS.md 2026-10-18). */
export const DEFAULT_SKIN = "pilcrow";

export const SKINS: Record<string, Skin> = {
  "test-dummy": testDummyJson as Skin,
  pilcrow: pilcrowJson as Skin,
  bookworm: bookwormJson as Skin,
  cassette: cassetteJson as Skin,
};
