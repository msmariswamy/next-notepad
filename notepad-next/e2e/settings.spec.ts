import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+,");
  await expect(page.getByTestId("settings-dialog")).toBeVisible();
});

test("silentClose off is the default and prompts", async ({ page }) => {
  await expect(page.locator('input[name="silentClose"]')).not.toBeChecked();
});

test("turning silentClose on closes a dirty tab without a prompt", async ({ page }) => {
  await page.locator('input[name="silentClose"]').check();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.type("keep");
  await page.getByLabel("Close new 1").click();
  await expect(page.getByTestId("confirm-unsaved")).toHaveCount(0);
  await expect(page.locator(".cm-content")).toHaveText("");
});

test("choosing the dark theme applies it immediately", async ({ page }) => {
  await page.locator('select[name="theme"]').selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("font size applies to the editor", async ({ page }) => {
  await page.locator('input[name="fontSize"]').fill("20");
  await page.locator('input[name="fontSize"]').blur();
  const size = await page.locator(".cm-scroller").evaluate((el) => getComputedStyle(el).fontSize);
  expect(size).toBe("20px");
});

test("word wrap can be switched on", async ({ page }) => {
  await page.locator('input[name="wordWrap"]').check();
  await expect(page.locator(".cm-content")).toHaveClass(/cm-lineWrapping/);
});
