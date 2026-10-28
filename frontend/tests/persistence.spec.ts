import { expect, test, type Page } from "@playwright/test";
import { expectBoard, loginWithFreshBoard } from "./helpers";

const dragCardToColumn = async (page: Page, cardId: string, columnId: string) => {
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

const waitForSave = (page: Page) =>
  page.waitForResponse(
    (response) => response.url().endsWith("/api/board") && response.request().method() === "PUT"
  );

test("persists all board changes across reload and re-login", async ({ page }) => {
  await loginWithFreshBoard(page);
  const backlog = page.getByTestId("column-col-backlog");

  // Rename a column
  await backlog.getByLabel("Column title").fill("Ideas");

  // Add a card
  await backlog.getByRole("button", { name: /add a card/i }).click();
  await backlog.getByPlaceholder("Card title").fill("Persisted card");
  await backlog.getByPlaceholder("Details").fill("Survives reload.");
  await backlog.getByRole("button", { name: /add card/i }).click();

  // Edit a card
  const card2 = page.getByTestId("card-card-2");
  await card2.getByRole("button", { name: /edit/i }).click();
  await card2.getByLabel("Card title").fill("Edited and saved");
  await card2.getByRole("button", { name: /save/i }).click();

  // Delete a card
  await page.getByRole("button", { name: "Delete Ship marketing page", exact: true }).click();

  // Move a card
  const saved = waitForSave(page);
  await dragCardToColumn(page, "card-1", "col-review");
  await saved;

  const verify = async () => {
    await expectBoard(page);
    await expect(page.getByTestId("column-col-backlog").getByLabel("Column title")).toHaveValue("Ideas");
    await expect(page.getByTestId("column-col-backlog").getByText("Persisted card")).toBeVisible();
    await expect(page.getByTestId("card-card-2")).toContainText("Edited and saved");
    await expect(page.getByText("Ship marketing page")).toHaveCount(0);
    await expect(page.getByTestId("column-col-review").getByTestId("card-card-1")).toBeVisible();
  };

  await page.reload();
  await verify();

  await page.getByRole("button", { name: /log out/i }).click();
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await verify();
});
