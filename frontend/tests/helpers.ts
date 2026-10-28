import { expect, type Page } from "@playwright/test";

export const login = async (page: Page, password = "password") => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
};

export const expectBoard = async (page: Page) => {
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
};
