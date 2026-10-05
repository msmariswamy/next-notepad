import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId("menubar").locator(".menu-title", { hasText: /^Language$/ }).click();
  await page.getByTestId("menubar").locator('[data-command="lang.JSON"]').click();
  await page.locator(".cm-content").click();
});

test("a syntax error is underlined at its position", async ({ page }) => {
  await page.keyboard.insertText('{"a": 1 "b": 2}');
  await expect(page.locator(".cm-json-error")).toHaveCount(1);
  await expect(page.locator(".cm-json-error")).toHaveText('"');
});

test("valid JSON has no error mark", async ({ page }) => {
  await page.keyboard.insertText('{"a": 1, "b": [1, 2]}');
  await page.waitForTimeout(500);
  await expect(page.locator(".cm-json-error")).toHaveCount(0);
});

test("the mark disappears once the JSON is fixed", async ({ page }) => {
  await page.keyboard.insertText('{"a": 1 "b": 2}');
  await expect(page.locator(".cm-json-error")).toHaveCount(1);
  await page.keyboard.press("Meta+a");
  await page.keyboard.insertText('{"a": 1, "b": 2}');
  await expect(page.locator(".cm-json-error")).toHaveCount(0);
});

test("an unterminated document marks the end", async ({ page }) => {
  await page.keyboard.insertText('{"a":');
  await expect(page.locator(".cm-json-error")).toHaveCount(1);
});

test("other languages show no JSON error marks", async ({ page }) => {
  await page.getByTestId("menubar").locator(".menu-title", { hasText: /^Language$/ }).click();
  await page.getByTestId("menubar").locator('[data-command="lang.Python"]').click();
  await page.locator(".cm-content").click();
  await page.keyboard.insertText('{"a": 1 "b": 2}');
  await page.waitForTimeout(500);
  await expect(page.locator(".cm-json-error")).toHaveCount(0);
});

test("pasted JSON with a typo is detected as JSON and the error is marked", async ({ page }) => {
  // A fresh tab: Normal text, so content detection applies.
  await page.getByLabel("New tab").click();
  await page.keyboard.insertText('{"name": "x",\n "n": }');
  await expect(page.getByTestId("statusbar")).toContainText("JSON");
  await expect(page.locator(".cm-json-error")).toHaveCount(1);
});
