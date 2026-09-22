import { defineConfig, devices } from "@playwright/test";

// Fixture-matrix screenshots (PLAN.md Phase 3 gate). Chromium ≈ WebView2 (Windows);
// WebKit ≈ WKWebView (macOS) — an approximation only, the real-Mac pass still applies (D13).
// Runs against the Vite dev server because fixtures/DevHarness only exist in DEV builds.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  reporter: [["list"]],
  use: { baseURL: "http://localhost:1420" },
  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:1420",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // Production bundle, for e2e/production.spec.ts (no DEV harness, no fixtures).
      command: "npm run build && npx vite preview --port 4173 --strictPort",
      url: "http://localhost:4173",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
