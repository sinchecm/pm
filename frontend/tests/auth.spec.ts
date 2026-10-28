import { expect, test } from "@playwright/test";
import {
  PASSWORD,
  expectBoard,
  fillCredentials,
  login,
  registerUser,
  uniqueUsername,
} from "./helpers";

test("shows the sign in form when not signed in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("rejects invalid credentials", async ({ page }) => {
  await login(page, "user", "wrong");
  await expect(page.getByText("Invalid username or password")).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("the demo account signs in, keeps the session on reload, and logs out", async ({ page }) => {
  await login(page);
  await expectBoard(page);
  await expect(page.getByTestId("current-user")).toHaveText("user");

  await page.reload();
  await expectBoard(page);

  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
});

test("creates an account, signs out and signs back in", async ({ page }) => {
  const username = uniqueUsername();
  await page.goto("/");
  await page.getByRole("button", { name: /create an account/i }).click();
  await fillCredentials(page, username, PASSWORD);
  await page.getByRole("button", { name: /^create account$/i }).click();

  await expectBoard(page);
  await expect(page.getByTestId("current-user")).toHaveText(username);
  await expect(page.getByLabel("Board name", { exact: true })).toHaveValue("My Board");

  await page.getByRole("button", { name: /log out/i }).click();
  await login(page, username, PASSWORD);
  await expectBoard(page);
});

test("rejects a taken username", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /create an account/i }).click();
  await fillCredentials(page, "user", "password123");
  await page.getByRole("button", { name: /^create account$/i }).click();
  await expect(page.getByText("That username is taken")).toBeVisible();
});

test("changes the password", async ({ page }) => {
  const username = await registerUser(page);
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByLabel("New password").fill("brand-new-password");
  await page.getByRole("button", { name: /update password/i }).click();
  await expect(page.getByText("Password updated.")).toBeVisible();

  await page.getByRole("button", { name: /log out/i }).click();
  await login(page, username, PASSWORD);
  await expect(page.getByText("Invalid username or password")).toBeVisible();
  await login(page, username, "brand-new-password");
  await expectBoard(page);
});

test("deletes the account", async ({ page }) => {
  const username = await registerUser(page);
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByLabel(/confirm with your password/i).fill(PASSWORD);
  await page.getByRole("button", { name: "Delete account" }).click();

  await expect(page.getByText("Your account was deleted.")).toBeVisible();
  await login(page, username, PASSWORD);
  await expect(page.getByText("Invalid username or password")).toBeVisible();
});
