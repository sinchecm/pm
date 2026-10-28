import { expect, test } from "@playwright/test";
import { dragCardToColumn, expectBoard, registerUser, waitForSave } from "./helpers";

test.beforeEach(async ({ page }) => {
  await registerUser(page);
});

test("loads the kanban board", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expectBoard(page);
  await expect(page.getByTestId("board-stats")).toContainText("8 cards");
});

test("adds a card to a column", async ({ page }) => {
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("edits a card", async ({ page }) => {
  const card = page.getByTestId("card-card-1");
  await card.getByRole("button", { name: /edit align roadmap themes/i }).click();
  await card.getByLabel("Card title").fill("Edited in e2e");
  await card.getByLabel("Card details").fill("New details.");
  await card.getByRole("button", { name: /save/i }).click();
  await expect(card.getByText("Edited in e2e")).toBeVisible();
  await expect(card.getByText("New details.")).toBeVisible();
});

test("renames a column", async ({ page }) => {
  const title = page.getByTestId("column-col-backlog").getByLabel("Column title");
  await title.fill("Ideas");
  await expect(title).toHaveValue("Ideas");
});

test("moves a card between columns", async ({ page }) => {
  const targetColumn = page.getByTestId("column-col-review");
  await dragCardToColumn(page, "card-1", "col-review");
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("adds and removes columns", async ({ page }) => {
  const saved = waitForSave(page);
  await page.getByRole("button", { name: /add column/i }).click();
  await expectBoard(page, 6);
  await saved;
  const newColumn = page.locator('[data-testid^="column-"]').last();
  await newColumn.getByLabel("Column title").fill("Blocked");

  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete column Backlog" }).click();
  await expectBoard(page, 5);
  await expect(page.getByText("Align roadmap themes")).toHaveCount(0);

  await page.reload();
  await expectBoard(page, 5);
  await expect(page.locator('[data-testid^="column-"]').last().getByLabel("Column title")).toHaveValue(
    "Blocked"
  );
  await expect(page.getByTestId("column-col-backlog")).toHaveCount(0);
});

test("sets priority and due date on a card", async ({ page }) => {
  const card = page.getByTestId("card-card-7");
  await card.getByRole("button", { name: /edit/i }).click();
  await card.getByLabel("Priority").selectOption("high");
  await card.getByLabel("Due date").fill("2020-01-15");
  const saved = waitForSave(page);
  await card.getByRole("button", { name: /save/i }).click();
  await saved;

  // card-7 is in Done (the last column), so it is not counted as overdue there
  await expect(card.getByText("High priority")).toBeVisible();
  await expect(card.getByTestId("due-date")).toHaveText("Due Jan 15, 2020");

  await dragCardToColumn(page, "card-7", "col-review");
  await expect(page.getByTestId("column-col-review").getByTestId("card-card-7")).toBeVisible();
  await expect(page.getByTestId("card-card-7").getByTestId("due-date")).toHaveText(
    "Overdue: Jan 15, 2020"
  );
  await expect(page.getByTestId("board-stats")).toContainText("1 overdue");

  await page.reload();
  await expect(page.getByTestId("card-card-7").getByText("High priority")).toBeVisible();
});

test("filters cards by search and priority", async ({ page }) => {
  await page.getByLabel("Search cards").fill("analytics");
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(1);
  await expect(page.getByTestId("card-card-3")).toBeVisible();

  await page.getByLabel("Search cards").fill("");
  await page.getByLabel("Filter by priority").selectOption("high");
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(2);

  await page.getByLabel("Filter by priority").selectOption("all");
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(8);
});

test("adds labels and a checklist, ticks items, and filters by label", async ({ page }) => {
  const card = page.getByTestId("card-card-7");
  await card.getByRole("button", { name: /edit/i }).click();
  await card.getByLabel("Labels").fill("launch, marketing");
  await card.getByLabel("Checklist").fill("Write copy\nShip assets");
  let saved = waitForSave(page);
  await card.getByRole("button", { name: /save/i }).click();
  await saved;

  await expect(card.getByRole("list", { name: "Labels" })).toHaveText(/launch.*marketing/);
  await expect(card.getByTestId("checklist-progress")).toHaveText("Checklist 0/2");

  saved = waitForSave(page);
  await card.getByLabel("Write copy").check();
  await saved;
  await expect(card.getByTestId("checklist-progress")).toHaveText("Checklist 1/2");

  await page.getByLabel("Filter by label").selectOption("launch");
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(1);

  await page.reload();
  await expect(page.getByTestId("card-card-7").getByLabel("Write copy")).toBeChecked();
  await expect(page.getByTestId("card-card-7").getByTestId("checklist-progress")).toHaveText(
    "Checklist 1/2"
  );
});
