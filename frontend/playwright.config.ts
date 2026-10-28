import { defineConfig, devices } from "@playwright/test";

// E2E tests run against a separate test container on port 8002 (scripts/test-e2e.sh), never the real app on 8001.
// Each test registers its own user, so tests are independent and can run in parallel.
// Two workers: more Chromium instances push this machine's memory into swap, and the
// resulting stalls make assertions time out.
export default defineConfig({
  testDir: "./tests",
  workers: 2,
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
      use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1000 } },
    },
  ],
});
