import { expect, test } from "@playwright/test";

test("app shell loads in WebKit", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main.container")).toBeVisible();
});
