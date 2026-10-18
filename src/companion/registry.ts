// Every bundled companion skin, keyed by id (PLAN.md §4b, docs/COMPANION.md). Validated by companion.test.ts; user skins
// arrive later with the loader. `test-dummy` is the deliberately plain C1 placeholder. `pilcrow`, `bookworm` and
// `cassette` are the D1 design round's concepts (scripts/gen-companions.mjs); the ones not chosen get removed.
import bookwormJson from "../../companions/bookworm/companion.json";
import cassetteJson from "../../companions/cassette/companion.json";
import pilcrowJson from "../../companions/pilcrow/companion.json";
import testDummyJson from "../../companions/test-dummy/companion.json";
import type { Skin } from "./skin";

export const DEFAULT_SKIN = "test-dummy";

export const SKINS: Record<string, Skin> = {
  "test-dummy": testDummyJson as Skin,
  pilcrow: pilcrowJson as Skin,
  bookworm: bookwormJson as Skin,
  cassette: cassetteJson as Skin,
};
