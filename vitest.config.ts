import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Tests read stylesheets ?raw (variant.test.ts: structure.css; shell.test.ts and contractDoc.test.ts: the rest).
    // Vitest otherwise replaces every CSS import with an empty string, ?raw included (until M3 L1 only structure.css
    // was listed here, so contractDoc.test.ts's scan of fx.css and guard.css read nothing; DECISIONS.md).
    css: { include: [/\.css(\?|$)/] },
  },
});
