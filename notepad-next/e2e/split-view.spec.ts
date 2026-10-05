import { expect, test, type Page } from "@playwright/test";

const bar = (page: Page) => page.getByTestId("menubar");
const first = (page: Page) => page.locator("#editor .cm-content");
const second = (page: Page) => page.locator("#editor2 .cm-content");

async function viewMenu(page: Page, id: string) {
  await bar(page).locator(".menu-title", { hasText: /^View$/ }).click();
  await bar(page).locator(`[data-command="${id}"]`).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await first(page).click();
  await page.keyboard.insertText("shared text");
  // CodeMirror merges edits made within 500 ms into one undo step; wait so later edits are their own step.
  await page.waitForTimeout(600);
  await viewMenu(page, "view.splitVertical");
});

test("a split shows the same document in two panes side by side", async ({ page }) => {
  await expect(second(page)).toHaveText("shared text");
  const a = (await page.locator("#editor").boundingBox())!;
  const b = (await page.locator("#editor2").boundingBox())!;
  expect(b.x).toBeGreaterThan(a.x + a.width - 2);
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);
});

test("a horizontal split stacks the panes", async ({ page }) => {
  await viewMenu(page, "view.splitHorizontal");
  const a = (await page.locator("#editor").boundingBox())!;
  const b = (await page.locator("#editor2").boundingBox())!;
  expect(b.y).toBeGreaterThan(a.y + a.height - 2);
});

test("typing in the second pane appears in the first and the tab is marked modified", async ({ page }) => {
  await second(page).click();
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.insertText("!");
  await expect(first(page)).toHaveText("shared text!");
  await expect(page.locator(".tab.dirty")).toHaveCount(1);
});

test("undo from the first pane reverts the edit made in the second", async ({ page }) => {
  await second(page).click();
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.insertText("!");
  await first(page).click();
  await page.keyboard.press("Meta+z");
  await expect(first(page)).toHaveText("shared text");
  await expect(second(page)).toHaveText("shared text");
});

test("undo inside the second pane acts on the shared history", async ({ page }) => {
  await first(page).click();
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.insertText("?");
  await expect(second(page)).toHaveText("shared text?");
  await second(page).click();
  await page.keyboard.press("Meta+z");
  await expect(first(page)).toHaveText("shared text");
  await expect(second(page)).toHaveText("shared text");
});

test("Close Split leaves a single pane with the document intact", async ({ page }) => {
  await viewMenu(page, "view.closeSplit");
  await expect(page.locator("#editor2")).toBeHidden();
  await expect(first(page)).toHaveText("shared text");
});

test("switching tabs closes the split", async ({ page }) => {
  await page.getByLabel("New tab").click();
  await expect(page.locator("#editor2")).toBeHidden();
});
