import { expect, test } from "@playwright/test";
import { loginWithFreshBoard } from "./helpers";

// Uses the real AI through the test container (needs OPENROUTER_API_KEY in .env)
test("AI chat creates a card that appears on the board without reload", async ({ page }) => {
  await loginWithFreshBoard(page);

  await page.getByRole("button", { name: "AI Assistant", exact: true }).click();
  await page.getByLabel("Message").fill("Add a card titled 'Plan launch party' to the Backlog column.");
  await page.getByRole("button", { name: /send/i }).click();

  await expect(page.getByTestId("chat-message-user")).toHaveText(
    "Add a card titled 'Plan launch party' to the Backlog column."
  );
  const backlog = page.getByTestId("column-col-backlog");
  await expect(backlog.getByText("Plan launch party")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("chat-message-assistant")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("column-col-backlog").getByText("Plan launch party")).toBeVisible();
});

test("AI chat answers a question without changing the board", async ({ page }) => {
  await loginWithFreshBoard(page);

  await page.getByRole("button", { name: "AI Assistant", exact: true }).click();
  await page.getByLabel("Message").fill("How many cards are in the Done column?");
  await page.getByRole("button", { name: /send/i }).click();

  await expect(page.getByTestId("chat-message-assistant")).toContainText("2", { timeout: 45_000 });
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(8);
});
