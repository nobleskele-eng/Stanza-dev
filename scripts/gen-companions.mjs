// Writes the D1 concept skins to companions/<id>/companion.json (docs/COMPANION.md). Each concept is drawn in
// scripts/companions/<id>.mjs. Run: node scripts/gen-companions.mjs
import { mkdirSync } from "node:fs";
import { bookworm } from "./companions/bookworm.mjs";
import { cassette } from "./companions/cassette.mjs";
import { writeSkin } from "./companions/pixels.mjs";
import { pilcrow } from "./companions/pilcrow.mjs";

for (const skin of [pilcrow, bookworm, cassette]) {
  const dir = new URL(`../companions/${skin.id}/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeSkin(skin, new URL("companion.json", dir));
}
