import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // structure.css is imported ?raw by variant.test.ts to keep HIDEABLE_PARTS in sync with it;
    // Vitest otherwise replaces CSS imports with an empty string.
    css: { include: [/structure.css/] },
  },
});
