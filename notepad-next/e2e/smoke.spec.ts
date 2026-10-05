import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("typing updates the status bar", async ({ page }) => {
  await page.locator(".cm-content").click();
  await page.keyboard.type("hello\nworld");
  await expect(page.getByTestId("statusbar")).toContainText("Ln: 2");
  await expect(page.getByTestId("statusbar")).toContainText("length: 11");
});

test("line numbers are shown", async ({ page }) => {
  await expect(page.locator(".cm-lineNumbers")).toBeVisible();
});

test("new tab opens as 'new 2' and becomes active", async ({ page }) => {
  await page.getByLabel("New tab").click();
  await expect(page.locator(".tab.active .tab-title")).toHaveText("new 2");
  await expect(page.locator(".tab")).toHaveCount(2);
});

test("each tab keeps its own text", async ({ page }) => {
  await page.locator(".cm-content").click();
  await page.keyboard.type("first");
  await page.getByLabel("New tab").click();
  await page.keyboard.type("second");
  await page.locator(".tab", { hasText: "new 1" }).click();
  await expect(page.locator(".cm-content")).toHaveText("first");
});

test("typing marks the tab modified", async ({ page }) => {
  await page.locator(".cm-content").click();
  await page.keyboard.type("x");
  await expect(page.locator(".tab.dirty")).toHaveCount(1);
});

test("closing a dirty tab prompts, and Cancel keeps it", async ({ page }) => {
  await page.locator(".cm-content").click();
  await page.keyboard.type("x");
  await page.getByLabel("Close new 1").click();
  await expect(page.getByTestId("confirm-unsaved")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("confirm-unsaved")).toHaveCount(0);
  await expect(page.locator(".cm-content")).toHaveText("x");
});

test("Don't Save closes the tab and leaves a fresh one", async ({ page }) => {
  await page.locator(".cm-content").click();
  await page.keyboard.type("x");
  await page.getByLabel("Close new 1").click();
  await page.getByRole("button", { name: "Don't Save" }).click();
  await expect(page.locator(".tab")).toHaveCount(1);
  await expect(page.locator(".cm-content")).toHaveText("");
});
