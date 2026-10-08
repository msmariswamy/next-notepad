import { expect, test, type Page } from "@playwright/test";

const content = (page: Page) => page.locator("#editor .cm-content");
const selectionColor = (page: Page) =>
  page.locator("#editor .cm-selectionBackground").first().evaluate((el) => getComputedStyle(el).backgroundColor);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

async function selectAllIn(page: Page, theme: "dark" | "light") {
  await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
  await content(page).click();
  await page.keyboard.insertText("some selected text");
  await page.keyboard.press("Meta+a");
}

test("in the dark theme the selection is a dark blue behind the light text, not CodeMirror's pale lavender", async ({ page }) => {
  await selectAllIn(page, "dark");
  await expect.poll(() => selectionColor(page)).toBe("rgb(38, 79, 120)");
});

test("in the light theme the selection keeps CodeMirror's default colour", async ({ page }) => {
  await selectAllIn(page, "light");
  await expect.poll(() => selectionColor(page)).not.toBe("rgb(38, 79, 120)");
});
