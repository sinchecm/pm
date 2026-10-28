import { expect, test, type Browser, type Page } from "@playwright/test";
import { boardNav, registerUser, waitForSave } from "./helpers";

// The owner (page) and a second user in their own browser context
const setUpPair = async (page: Page, browser: Browser) => {
  const owner = await registerUser(page);
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  const member = await registerUser(memberPage);
  return { owner, member, memberPage, close: () => memberContext.close() };
};

const shareWith = async (page: Page, username: string) => {
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.getByLabel("Share with username").fill(username);
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(page.getByTestId("member").filter({ hasText: username })).toBeVisible();
};

const openSharedBoard = async (page: Page, owner: string) => {
  await page.reload();
  await boardNav(page).getByRole("button", { name: new RegExp(`Shared by ${owner}`) }).click();
  await expect(page.getByRole("button", { name: "Members" })).toBeVisible();
};

test("a member sees, edits and leaves a shared board", async ({ page, browser }) => {
  const { owner, member, memberPage, close } = await setUpPair(page, browser);
  await shareWith(page, member);

  await openSharedBoard(memberPage, owner);
  await expect(memberPage.getByRole("button", { name: /delete board/i })).toHaveCount(0);
  await expect(memberPage.getByLabel("Board name", { exact: true })).toHaveAttribute("readonly");

  const card = memberPage.getByTestId("card-card-1");
  await card.getByRole("button", { name: /edit/i }).click();
  await card.getByLabel("Card title").fill("Edited by the member");
  const saved = waitForSave(memberPage);
  await card.getByRole("button", { name: /save/i }).click();
  expect((await saved).ok()).toBe(true);

  await page.reload();
  await expect(page.getByTestId("card-card-1")).toContainText("Edited by the member");

  memberPage.on("dialog", (dialog) => dialog.accept());
  await memberPage.getByRole("button", { name: "Members" }).click();
  await memberPage.getByRole("button", { name: "Leave board" }).click();
  await expect(boardNav(memberPage).getByRole("button", { name: /Shared by/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByTestId("member")).toHaveCount(1);
  await close();
});

test("a stale edit is not saved over someone else's change", async ({ page, browser }) => {
  const { owner, member, memberPage, close } = await setUpPair(page, browser);
  await shareWith(page, member);
  await openSharedBoard(memberPage, owner);

  // The member saves first; the owner's page still shows the old board
  const memberSaved = waitForSave(memberPage);
  await memberPage.getByTestId("column-col-review").getByLabel("Column title").fill("QA");
  await memberSaved;

  const conflict = page.waitForResponse(
    (response) => response.request().method() === "PUT" && response.status() === 412,
  );
  await page.getByTestId("column-col-backlog").getByLabel("Column title").fill("Stale edit");
  await conflict;

  await expect(page.getByText(/changed by someone else/)).toBeVisible();
  await expect(page.getByTestId("column-col-review").getByLabel("Column title")).toHaveValue("QA");
  await expect(page.getByTestId("column-col-backlog").getByLabel("Column title")).toHaveValue(
    "Backlog",
  );

  await page.reload();
  await expect(page.getByTestId("column-col-review").getByLabel("Column title")).toHaveValue("QA");
  await close();
});

test("the owner removes a member", async ({ page, browser }) => {
  const { owner, member, memberPage, close } = await setUpPair(page, browser);
  await shareWith(page, member);
  await page.getByRole("button", { name: `Remove ${member}` }).click();
  await expect(page.getByTestId("member")).toHaveCount(1);

  await memberPage.reload();
  await expect(
    boardNav(memberPage).getByRole("button", { name: new RegExp(`Shared by ${owner}`) }),
  ).toHaveCount(0);
  await close();
});

test("sharing with an unknown user shows an error", async ({ page }) => {
  await registerUser(page);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.getByLabel("Share with username").fill("no-such-user-here");
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(page.getByText("No user with that username")).toBeVisible();
});

test("assigns a card to a member, who finds it in My cards", async ({ page, browser }) => {
  const { owner, member, memberPage, close } = await setUpPair(page, browser);
  await shareWith(page, member);

  const card = page.getByTestId("card-card-1");
  await card.getByRole("button", { name: /edit/i }).click();
  await card.getByLabel("Assignee").selectOption(member);
  const saved = waitForSave(page);
  await card.getByRole("button", { name: /save/i }).click();
  expect((await saved).ok()).toBe(true);
  await expect(card.getByTestId("assignee")).toHaveText(new RegExp(member));

  await memberPage.reload();
  await memberPage.getByRole("button", { name: "My cards" }).click();
  const item = memberPage.getByTestId("my-card");
  await expect(item).toHaveCount(1);
  await expect(item).toContainText("Align roadmap themes");
  await item.getByRole("button", { name: "Open board" }).click();
  await expect(memberPage.getByRole("button", { name: "Members" })).toBeVisible();
  await expect(
    boardNav(memberPage).getByRole("button", { name: new RegExp(`Shared by ${owner}`) }),
  ).toHaveAttribute("aria-current", "page");

  // Removing the member unassigns their card
  await page.getByRole("button", { name: `Remove ${member}` }).click();
  await expect(page.getByTestId("card-card-1").getByTestId("assignee")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("card-card-1").getByTestId("assignee")).toHaveCount(0);
  await close();
});

test("owner and member comment on a shared card", async ({ page, browser }) => {
  const { owner, member, memberPage, close } = await setUpPair(page, browser);
  await shareWith(page, member);

  const postComment = async (target: Page, text: string) => {
    const card = target.getByTestId("card-card-1");
    if (!(await card.getByLabel("New comment").isVisible())) {
      await card.getByRole("button", { name: /comments on/i }).click();
    }
    await card.getByLabel("New comment").fill(text);
    await card.getByRole("button", { name: "Post" }).click();
    await expect(card.getByTestId("comment").filter({ hasText: text })).toBeVisible();
  };

  await postComment(page, "Owner says hi");
  await openSharedBoard(memberPage, owner);
  await postComment(memberPage, "Member replies");

  // The member can delete only their own comment
  const memberCard = memberPage.getByTestId("card-card-1");
  await expect(memberCard.getByRole("button", { name: `Delete comment by ${owner}` })).toHaveCount(0);
  await expect(memberCard.getByRole("button", { name: `Delete comment by ${member}` })).toBeVisible();

  await page.reload();
  const ownerCard = page.getByTestId("card-card-1");
  await expect(ownerCard.getByRole("button", { name: /comments on/i })).toHaveText("2 comments");
  await ownerCard.getByRole("button", { name: /comments on/i }).click();
  await expect(ownerCard.getByTestId("comment")).toHaveText([
    new RegExp(`${owner}.*Owner says hi`),
    new RegExp(`${member}.*Member replies`),
  ]);
  await ownerCard.getByRole("button", { name: `Delete comment by ${member}` }).click();
  await expect(ownerCard.getByRole("button", { name: /comments on/i })).toHaveText("1 comment");
  await close();
});
