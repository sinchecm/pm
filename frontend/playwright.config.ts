import { defineConfig, devices } from "@playwright/test";

// E2E tests run against a separate test container on port 8002 (scripts/test-e2e.sh), never the real app on 8001.
// One worker: all tests share the single user's persisted board.
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:8002",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
