import { expect, type Page } from "@playwright/test";
import { initialData } from "../src/lib/kanban";

export const login = async (page: Page, password = "password") => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
};

// Sign in with the board reset to the default, so tests don't depend on each other
export const loginWithFreshBoard = async (page: Page) => {
  await login(page);
  await expectBoard(page);
  const response = await page.request.put("/api/board", { data: initialData });
  expect(response.ok()).toBe(true);
  await page.reload();
  await expectBoard(page);
};

export const expectBoard = async (page: Page) => {
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
};
