import { expect, test } from "@playwright/test";
import {
  PASSWORD,
  dragCardToColumn,
  expectBoard,
  fillCredentials,
  registerUser,
  waitForSave,
} from "./helpers";

test("persists all board changes across reload and re-login", async ({ page }) => {
  const username = await registerUser(page);
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
  await fillCredentials(page, username, PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await verify();
});
