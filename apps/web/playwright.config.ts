import { defineConfig, devices } from "@playwright/test";

/**
 * Browser-Tests (Ende-zu-Ende) gegen einen laufenden Produktions-Build im Testmodus
 * (Zahlungen simuliert). Lokal: `pnpm build && pnpm e2e` – ein laufender Server auf
 * E2E_PORT (Standard 3100) wird wiederverwendet. Die Tests verändern Daten und laufen
 * deshalb nacheinander gegen eine Datenbank mit Demo-Daten (SEED_DEMO=true).
 */
const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    locale: "de-CH",
    timezoneId: "Europe/Zurich",
    viewport: { width: 1360, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 } } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm start",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
        env: { PORT: String(port), NODE_ENV: "test" },
      },
});
