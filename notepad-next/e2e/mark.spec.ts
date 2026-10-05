import { expect, test, type Page } from "@playwright/test";

const dialog = (page: Page) => page.getByTestId("find-dialog");

/** Type `text` (lines separated by \n) into the editor, then open the Mark tab searching for `find`. */
async function openMark(page: Page, text: string, find: string) {
  await page.locator(".cm-content").click();
  const lines = text.split("\n");
  for (const [i, line] of lines.entries()) {
    if (i > 0) await page.keyboard.press("Enter");
    await page.keyboard.type(line);
  }
  await page.keyboard.press("Meta+f");
  await dialog(page).locator('[data-tab="mark"]').click();
  await dialog(page).locator('[name="findWhat"]').fill(find);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("Mark tab shows five styles and the mark controls", async ({ page }) => {
  await openMark(page, "x", "x");
  await expect(dialog(page).locator('input[name="markStyle"]')).toHaveCount(5);
  await expect(dialog(page).getByRole("button", { name: "Mark All" })).toBeVisible();
  await expect(dialog(page).locator('[name="bookmarkLine"]')).toBeVisible();
  await expect(dialog(page).locator('[name="purgeMarks"]')).toBeVisible();
});

test("Mark All highlights every match", async ({ page }) => {
  await openMark(page, "ab ab", "ab");
  await dialog(page).getByRole("button", { name: "Mark All" }).click();
  await expect(page.locator(".cm-mark-1")).toHaveCount(2);
});

test("two styles can be marked at the same time", async ({ page }) => {
  await openMark(page, "foo bar", "foo");
  await dialog(page).getByRole("button", { name: "Mark All" }).click();
  await dialog(page).locator('[name="findWhat"]').fill("bar");
  await dialog(page).locator('input[name="markStyle"][value="2"]').check();
  await dialog(page).getByRole("button", { name: "Mark All" }).click();
  await expect(page.locator(".cm-mark-1")).toHaveText("foo");
  await expect(page.locator(".cm-mark-2")).toHaveText("bar");
});

test("Bookmark line adds a gutter marker on matching lines", async ({ page }) => {
  await openMark(page, "error one\nfine", "error");
  await dialog(page).locator('[name="bookmarkLine"]').check();
  await dialog(page).getByRole("button", { name: "Mark All" }).click();
  await expect(page.locator(".cm-bookmark:visible")).toHaveCount(1);
});

test("Purge for each search clears earlier marks of the style", async ({ page }) => {
  await openMark(page, "foo bar", "foo");
  await dialog(page).getByRole("button", { name: "Mark All" }).click();
  await dialog(page).locator('[name="purgeMarks"]').check();
  await dialog(page).locator('[name="findWhat"]').fill("bar");
  await dialog(page).getByRole("button", { name: "Mark All" }).click();
  await expect(page.locator(".cm-mark-1")).toHaveCount(1);
  await expect(page.locator(".cm-mark-1")).toHaveText("bar");
});

test("Clear all marks removes the highlights", async ({ page }) => {
  await openMark(page, "ab ab", "ab");
  await dialog(page).getByRole("button", { name: "Mark All" }).click();
  await dialog(page).getByRole("button", { name: "Clear all marks" }).click();
  await expect(page.locator(".cm-mark-1")).toHaveCount(0);
});

test("a new line inserted above keeps the mark on its word", async ({ page }) => {
  await openMark(page, "word", "word");
  await dialog(page).getByRole("button", { name: "Mark All" }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-mark-1")).toHaveText("word");
});

test("F2 jumps to the next bookmark", async ({ page }) => {
  await openMark(page, "a\nb\na", "a");
  await dialog(page).locator('[name="bookmarkLine"]').check();
  await dialog(page).getByRole("button", { name: "Mark All" }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+ArrowUp");
  await page.keyboard.press("F2");
  await expect(page.getByTestId("statusbar")).toContainText("Ln: 3");
});
