import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3001";
// Метка в User-Agent: по ней после прогона чистим сессии тестов из БД.
const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 MGIMO-E2E";

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // E2E_OUT разводит артефакты параллельных прогонов, чтобы они не стирали друг друга.
  reporter: [["list"], ["json", { outputFile: `${process.env.E2E_OUT ?? "test-results"}/e2e.json` }]],
  outputDir: `${process.env.E2E_OUT ?? "test-results"}/artifacts`,
  use: {
    baseURL,
    channel: "chrome",
    headless: true,
    userAgent,
    screenshot: "only-on-failure",
    trace: "off",
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome", userAgent, viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { channel: "chrome", userAgent, viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: false } },
  ],
});
