import { expect, test, type Page } from "@playwright/test";

const dialog = (page: Page) => page.getByTestId("find-dialog");
const message = (page: Page) => page.getByTestId("find-message");

async function typeInEditor(page: Page, text: string) {
  await page.locator(".cm-content").click();
  await page.keyboard.type(text);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("Cmd+F opens the Find dialog with all five tabs", async ({ page }) => {
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+f");
  await expect(dialog(page)).toBeVisible();
  const labels = await dialog(page).locator(".find-tab").allTextContents();
  expect(labels).toEqual(["Find", "Replace", "Find in Files", "Find in Projects", "Mark"]);
});

test("Cmd+H opens on the Replace tab and prefills the selection", async ({ page }) => {
  await typeInEditor(page, "needle");
  await page.keyboard.press("Meta+a");
  await page.keyboard.press("Meta+h");
  await expect(dialog(page).locator(".find-tab.active")).toHaveText("Replace");
  await expect(dialog(page).locator('[name="findWhat"]')).toHaveValue("needle");
});

test("Find Next selects matches one after another", async ({ page }) => {
  await typeInEditor(page, "a b a");
  await page.keyboard.press("Meta+ArrowUp");
  await page.keyboard.press("Meta+f");
  await dialog(page).locator('[name="findWhat"]').fill("a");
  await dialog(page).getByRole("button", { name: "Find Next" }).first().click();
  await expect(page.getByTestId("statusbar")).toContainText("Sel: 1");
  await dialog(page).getByRole("button", { name: "Find Next" }).first().click();
  await dialog(page).getByRole("button", { name: "Find Next" }).first().click();
  await expect(message(page)).toHaveText("Can't find the text");
});

test("Count reports the number of matches", async ({ page }) => {
  await typeInEditor(page, "ab ab ab");
  await page.keyboard.press("Meta+f");
  await dialog(page).locator('[name="findWhat"]').fill("ab");
  await dialog(page).getByRole("button", { name: "Count", exact: true }).click();
  await expect(message(page)).toHaveText("Count: 3 matches");
});

test("Match case changes the count", async ({ page }) => {
  await typeInEditor(page, "Foo foo");
  await page.keyboard.press("Meta+f");
  await dialog(page).locator('[name="findWhat"]').fill("foo");
  await dialog(page).getByRole("button", { name: "Count", exact: true }).click();
  await expect(message(page)).toHaveText("Count: 2 matches");
  await dialog(page).locator('[name="matchCase"]').check();
  await dialog(page).getByRole("button", { name: "Count", exact: true }).click();
  await expect(message(page)).toHaveText("Count: 1 match");
});

test("Find All in Current Document fills the results panel and a click jumps to the match", async ({ page }) => {
  await typeInEditor(page, "one\ntwo todo\nthree");
  await page.keyboard.press("Meta+f");
  await dialog(page).locator('[name="findWhat"]').fill("todo");
  await dialog(page).getByRole("button", { name: "Find All in Current Document" }).click();
  await expect(page.getByTestId("results")).toContainText('Search "todo" (1 hit in 1 file)');
  await expect(page.getByTestId("results")).toContainText("Line 2: two todo");
  await page.locator(".results-hit").click();
  await expect(page.getByTestId("statusbar")).toContainText("Sel: 4");
});

test("Find All in All Opened Documents groups by tab", async ({ page }) => {
  await typeInEditor(page, "todo a");
  await page.getByLabel("New tab").click();
  await page.keyboard.type("todo b");
  await page.keyboard.press("Meta+f");
  await dialog(page).locator('[name="findWhat"]').fill("todo");
  await dialog(page).getByRole("button", { name: "Find All in All Opened Documents" }).click();
  await expect(page.getByTestId("results")).toContainText('(2 hits in 2 files)');
  await expect(page.locator(".results-doc")).toHaveCount(2);
});

test("Replace All with capture groups, then one undo reverts it", async ({ page }) => {
  await typeInEditor(page, "hello world");
  await page.keyboard.press("Meta+h");
  await dialog(page).locator('[name="findWhat"]').fill("(\\w+) (\\w+)");
  await dialog(page).locator('[name="replaceWith"]').fill("\\2 \\1");
  await dialog(page).locator('input[name="mode"][value="regex"]').check();
  await dialog(page).getByRole("button", { name: "Replace All", exact: true }).click();
  await expect(page.locator(".cm-content")).toHaveText("world hello");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+z");
  await expect(page.locator(".cm-content")).toHaveText("hello world");
});

test("Replace All in All Opened Documents updates every tab", async ({ page }) => {
  await typeInEditor(page, "foo one");
  await page.getByLabel("New tab").click();
  await page.keyboard.type("foo two");
  await page.keyboard.press("Meta+h");
  await dialog(page).locator('[name="findWhat"]').fill("foo");
  await dialog(page).locator('[name="replaceWith"]').fill("bar");
  await dialog(page).getByRole("button", { name: "Replace All in All Opened Documents" }).click();
  await expect(message(page)).toContainText("2 occurrences replaced in 2 documents");
  await expect(page.locator(".cm-content")).toHaveText("bar two");
  await page.locator(".tab", { hasText: "new 1" }).click();
  await expect(page.locator(".cm-content")).toHaveText("bar one");
});

test("Extended mode finds a newline", async ({ page }) => {
  await typeInEditor(page, "a");
  await page.keyboard.press("Enter");
  await page.keyboard.type("b");
  await page.keyboard.press("Meta+f");
  await dialog(page).locator('[name="findWhat"]').fill("a\\nb");
  await dialog(page).locator('input[name="mode"][value="extended"]').check();
  await dialog(page).getByRole("button", { name: "Count", exact: true }).click();
  await expect(message(page)).toHaveText("Count: 1 match");
});

test("an invalid regex shows an inline error and leaves the text alone", async ({ page }) => {
  await typeInEditor(page, "abc");
  await page.keyboard.press("Meta+f");
  await dialog(page).locator('[name="findWhat"]').fill("(unclosed");
  await dialog(page).locator('input[name="mode"][value="regex"]').check();
  await dialog(page).getByRole("button", { name: "Count", exact: true }).click();
  await expect(message(page)).toContainText("Invalid regular expression");
  await expect(page.locator(".cm-content")).toHaveText("abc");
});

test("'. matches newline' is only enabled in regular expression mode", async ({ page }) => {
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+f");
  await expect(dialog(page).locator('[name="dotMatchesNewline"]')).toBeDisabled();
  await dialog(page).locator('input[name="mode"][value="regex"]').check();
  await expect(dialog(page).locator('[name="dotMatchesNewline"]')).toBeEnabled();
});

test("earlier search terms are offered from history after a reload", async ({ page }) => {
  await typeInEditor(page, "x");
  await page.keyboard.press("Meta+f");
  await dialog(page).locator('[name="findWhat"]').fill("remember-me");
  await dialog(page).getByRole("button", { name: "Count", exact: true }).click();
  await page.reload();
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+f");
  await expect(dialog(page).locator("datalist#find-history option")).toHaveAttribute("value", "remember-me");
});

test("transparency 'always' makes the dialog translucent", async ({ page }) => {
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+f");
  await dialog(page).locator('[name="transparency"]').check();
  await dialog(page).locator('input[name="transparencyMode"][value="always"]').check();
  const opacity = await dialog(page).evaluate((d) => (d as HTMLElement).style.opacity);
  expect(Number(opacity)).toBeLessThan(1);
});

test("Escape closes the dialog", async ({ page }) => {
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+f");
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
});
