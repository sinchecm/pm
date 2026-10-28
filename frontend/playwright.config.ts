import { defineConfig, devices } from "@playwright/test";

// E2E tests run against the app container (scripts/start.sh), which serves the frontend and the API
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:8001",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
