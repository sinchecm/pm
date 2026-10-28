import { expect, test } from "@playwright/test";
import { boardNav, expectBoard, registerUser } from "./helpers";

test.beforeEach(async ({ page }) => {
  await registerUser(page);
});

const createBoard = async (page: import("@playwright/test").Page, name: string) => {
  await page.getByRole("button", { name: /new board/i }).click();
  await page.getByLabel("New board name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByLabel("Board name", { exact: true })).toHaveValue(name);
};

test("creates boards and keeps their cards separate", async ({ page }) => {
  await createBoard(page, "Launch");
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(0);

  const backlog = page.getByTestId("column-col-backlog");
  await backlog.getByRole("button", { name: /add a card/i }).click();
  await backlog.getByPlaceholder("Card title").fill("Launch-only card");
  await backlog.getByRole("button", { name: /add card/i }).click();
  await expect(backlog.getByText("Launch-only card")).toBeVisible();

  await boardNav(page).getByRole("button", { name: "My Board" }).click();
  await expect(page.getByTestId("card-card-1")).toBeVisible();
  await expect(page.getByText("Launch-only card")).toHaveCount(0);

  await boardNav(page).getByRole("button", { name: "Launch" }).click();
  await expect(page.getByText("Launch-only card")).toBeVisible();
});

test("reload keeps the selected board", async ({ page }) => {
  await createBoard(page, "Second");
  await page.reload();
  await expect(page.getByLabel("Board name", { exact: true })).toHaveValue("Second");
  await expect(boardNav(page).getByRole("button", { name: "Second" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("renames a board", async ({ page }) => {
  const name = page.getByLabel("Board name", { exact: true });
  await name.fill("Roadmap");
  await name.press("Enter");
  await expect(boardNav(page).getByRole("button", { name: "Roadmap" })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Board name", { exact: true })).toHaveValue("Roadmap");
});

test("deletes a board", async ({ page }) => {
  await createBoard(page, "Temporary");
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /delete board/i }).click();

  await expect(boardNav(page).getByRole("button", { name: "Temporary" })).toHaveCount(0);
  await expect(page.getByLabel("Board name", { exact: true })).toHaveValue("My Board");
  await expectBoard(page);

  await page.getByRole("button", { name: /delete board/i }).click();
  await expect(page.getByText("No boards yet")).toBeVisible();
  await page.reload();
  await expect(page.getByText("No boards yet")).toBeVisible();
});

test("users cannot see each other's boards", async ({ page, browser }) => {
  await page.getByLabel("Board name", { exact: true }).fill("Private plans");
  await page.getByLabel("Board name", { exact: true }).press("Enter");
  await expect(boardNav(page).getByRole("button", { name: "Private plans" })).toBeVisible();

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await registerUser(otherPage);
  await expect(boardNav(otherPage).getByRole("button", { name: "Private plans" })).toHaveCount(0);
  await otherContext.close();
});
