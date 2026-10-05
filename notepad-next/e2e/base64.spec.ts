import { expect, test, type Page } from "@playwright/test";

const bar = (page: Page) => page.getByTestId("menubar");
const content = (page: Page) => page.locator(".cm-content");

async function base64(page: Page, id: string) {
  await bar(page).locator(".menu-title", { hasText: /^Edit$/ }).click();
  await bar(page).locator('[data-submenu="Base64"]').hover();
  await bar(page).locator(`[data-command="${id}"]`).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await content(page).click();
});

test("encode then decode round-trips the document", async ({ page }) => {
  await page.keyboard.insertText("Hello €");
  await base64(page, "base64.encode");
  await expect(content(page)).toHaveText("SGVsbG8g4oKs");
  await base64(page, "base64.decode");
  await expect(content(page)).toHaveText("Hello €");
});

test("invalid input is left unchanged and a toast explains why", async ({ page }) => {
  await page.keyboard.insertText("not base64!");
  await base64(page, "base64.decode");
  await expect(content(page)).toHaveText("not base64!");
  await expect(page.locator(".toast.error")).toContainText(/not valid base64/i);
});

test("one undo reverts an encode", async ({ page }) => {
  await page.keyboard.insertText("abc");
  await base64(page, "base64.encode");
  await page.keyboard.press("Meta+z");
  await expect(content(page)).toHaveText("abc");
});
