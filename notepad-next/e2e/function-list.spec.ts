import { expect, test, type Page } from "@playwright/test";

const bar = (page: Page) => page.getByTestId("menubar");

async function menu(page: Page, title: string, id: string) {
  await bar(page).locator(".menu-title", { hasText: new RegExp(`^${title}$`) }).click();
  await bar(page).locator(`[data-command="${id}"]`).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await menu(page, "Language", "lang.JavaScript");
  await page.locator(".cm-content").click();
  await page.keyboard.insertText(Array.from({ length: 60 }, (_, i) => `function fn${i + 1}() {}\n`).join("") + "class Widget {}");
  await menu(page, "View", "view.functionList");
});

test("lists the document's functions and classes with line numbers", async ({ page }) => {
  const items = page.getByTestId("fl-item");
  await expect(items).toHaveCount(61);
  await expect(items.first()).toContainText("fn1");
  await expect(items.last()).toContainText("Widget");
  await expect(items.last().locator(".fl-line")).toHaveText("61");
});

test("filter narrows the list", async ({ page }) => {
  await expect(page.getByTestId("fl-item")).toHaveCount(61);
  await page.getByTestId("fl-filter").fill("widg");
  await expect(page.getByTestId("fl-item")).toHaveCount(1);
});

test("clicking a symbol jumps to its line", async ({ page }) => {
  await page.getByTestId("fl-filter").fill("fn30");
  await page.getByTestId("fl-item").first().click();
  await expect(page.getByTestId("statusbar")).toContainText("Ln: 30");
  await expect(page.locator(".cm-activeLine")).toContainText("fn30");
});

test("a new function appears after typing", async ({ page }) => {
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.insertText("\nfunction added() {}");
  await expect(page.getByTestId("fl-item").last()).toContainText("added");
});
