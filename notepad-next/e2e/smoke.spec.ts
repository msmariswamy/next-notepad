import { expect, test } from "@playwright/test";

test("typing updates the status bar", async ({ page }) => {
  await page.goto("/");
  await page.locator(".cm-content").click();
  await page.keyboard.type("hello\nworld");
  await expect(page.getByTestId("statusbar")).toContainText("Ln: 2");
  await expect(page.getByTestId("statusbar")).toContainText("length: 11");
});

test("line numbers are shown", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cm-lineNumbers")).toBeVisible();
});
