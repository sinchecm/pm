import { expect, test } from "@playwright/test";
import { expectBoard, login } from "./helpers";

test("shows login form when not signed in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("rejects invalid credentials", async ({ page }) => {
  await login(page, "wrong");
  await expect(page.getByText("Invalid username or password")).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("signs in, keeps the session on reload, and logs out", async ({ page }) => {
  await login(page);
  await expectBoard(page);

  await page.reload();
  await expectBoard(page);

  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});
