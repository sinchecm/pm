import { expect, type Page } from "@playwright/test";

export const PASSWORD = "e2e-password";

export const uniqueUsername = () =>
  `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const fillCredentials = async (page: Page, username: string, password: string) => {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
};

export const login = async (page: Page, username = "user", password = "password") => {
  await page.goto("/");
  await fillCredentials(page, username, password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
};

// Registers a brand new user through the API (sharing the page's cookies) and opens the app,
// so each test starts from its own starter board
export const registerUser = async (page: Page) => {
  const username = uniqueUsername();
  const response = await page.request.post("/api/register", {
    data: { username, password: PASSWORD },
  });
  expect(response.ok()).toBe(true);
  await page.goto("/");
  await expectBoard(page);
  return username;
};

export const expectBoard = async (page: Page, columns = 5) => {
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(columns);
};

export const dragCardToColumn = async (page: Page, cardId: string, columnId: string) => {
  const cardBox = await page.getByTestId(`card-${cardId}`).boundingBox();
  const columnBox = await page.getByTestId(`column-${columnId}`).boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(columnBox.x + columnBox.width / 2, columnBox.y + 120, { steps: 12 });
  await page.mouse.up();
};

export const waitForSave = (page: Page) =>
  page.waitForResponse(
    (response) =>
      /\/api\/boards\/\d+$/.test(response.url()) && response.request().method() === "PUT",
  );

export const boardNav = (page: Page) => page.getByRole("navigation", { name: "Boards" });
