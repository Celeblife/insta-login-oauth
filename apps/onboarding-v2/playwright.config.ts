import { defineConfig, devices } from "@playwright/test";

const port = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? "3102", 10);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results",
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      APP_ENV: "test",
      ONBOARDING_PROVIDER: "mock",
      MAIL_ENABLED: "false",
      CONTACT_EMAIL: process.env.CONTACT_EMAIL ?? "support@example.com",
    },
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    {
      name: "chromium-mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});
