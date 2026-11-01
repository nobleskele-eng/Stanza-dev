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

/**
 * The species the owner can pick, in the picker's order (C6a). The test dummy isn't one: it stays for the lab and the
 * tests, and a stored dummy still loads, but the menu never offers it.
 */
export const SPECIES = ["pilcrow", "bookworm", "cassette"] as const;

export const SKINS: Record<string, Skin> = {
  "test-dummy": testDummyJson as Skin,
  pilcrow: pilcrowJson as Skin,
  bookworm: bookwormJson as Skin,
  cassette: cassetteJson as Skin,
};
