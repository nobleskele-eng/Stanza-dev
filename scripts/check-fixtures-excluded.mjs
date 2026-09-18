// Fails the build if fixture data leaked into dist/ (CLAUDE.md: fixtures "must be
// excluded from production builds"). Every fixture string carries this marker.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MARKER = "FIXTURE-ONLY-DEV-BUILD";
const distDir = "dist";

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

const offenders = walk(distDir).filter((file) => {
  try {
    return readFileSync(file, "utf8").includes(MARKER);
  } catch {
    return false; // binary asset (icon, font, etc.) — can't contain a text marker
  }
});

if (offenders.length > 0) {
  console.error(`Fixture data leaked into production build:\n  ${offenders.join("\n  ")}`);
  process.exit(1);
}

console.log("check-fixtures-excluded: OK, no fixture markers found in dist/");
