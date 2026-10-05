import { expect, test, type Page } from "@playwright/test";

const bar = (page: Page) => page.getByTestId("menubar");

async function toggle(page: Page, id: string) {
  await bar(page).locator(".menu-title", { hasText: /^View$/ }).click();
  await bar(page).locator(`[data-command="${id}"]`).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("the dock is hidden by default", async ({ page }) => {
  await expect(page.getByTestId("dock")).toBeHidden();
});

test("View > Function List shows the dock and only that panel", async ({ page }) => {
  await toggle(page, "view.functionList");
  await expect(page.getByTestId("panel-functions")).toBeVisible();
  await expect(page.getByTestId("panel-map")).toBeHidden();
});

test("toggling both panels off hides the dock", async ({ page }) => {
  await toggle(page, "view.functionList");
  await toggle(page, "view.documentMap");
  await expect(page.getByTestId("panel-map")).toBeVisible();
  await toggle(page, "view.functionList");
  await toggle(page, "view.documentMap");
  await expect(page.getByTestId("dock")).toBeHidden();
});
