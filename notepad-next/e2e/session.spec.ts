import { expect, test } from "@playwright/test";

// A page reload stands in for quit + relaunch: the browser host persists the session in localStorage.
test("unsaved tabs and their text come back after relaunch", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.locator(".cm-content").click();
  await page.keyboard.type("first draft");
  await page.getByLabel("New tab").click();
  await page.keyboard.type("second draft");

  await page.reload();

  await expect(page.locator(".tab")).toHaveCount(2);
  await expect(page.locator(".tab.dirty")).toHaveCount(2);
  await expect(page.locator(".cm-content")).toHaveText("second draft");
  await page.locator(".tab", { hasText: "new 1" }).click();
  await expect(page.locator(".cm-content")).toHaveText("first draft");
});

test("the active tab is restored", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator(".cm-content").click();
  await page.keyboard.type("a");
  await page.getByLabel("New tab").click();
  await page.keyboard.type("b");
  await page.locator(".tab", { hasText: "new 1" }).click();
  await page.reload();
  await expect(page.locator(".tab.active .tab-title")).toContainText("new 1");
});

test("a fresh profile starts with one empty tab", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator(".tab")).toHaveCount(1);
  await expect(page.locator(".cm-content")).toHaveText("");
});

// Crash variant: suppress the pagehide flush so only the debounced snapshot can have saved the text.
test("text typed before a crash survives via the debounced snapshot", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator(".cm-content").click();
  await page.keyboard.type("typed before the crash");
  await page.waitForTimeout(2500); // longer than the 2 s debounce
  await page.evaluate(() =>
    window.addEventListener("pagehide", (e) => e.stopImmediatePropagation(), { capture: true }),
  );
  await page.reload();
  await expect(page.locator(".cm-content")).toHaveText("typed before the crash");
});

test("the caret and scroll position come back after relaunch", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.locator(".cm-content").click();
  await page.keyboard.insertText(Array.from({ length: 300 }, (_, i) => `line ${i + 1}`).join("\n"));
  // Put the caret on line 120 and scroll that region into view.
  await page.keyboard.press("Meta+ArrowUp");
  for (let i = 0; i < 119; i++) await page.keyboard.press("ArrowDown");
  await page.locator(".cm-scroller").evaluate((el) => (el.scrollTop = 1500));
  await expect(page.getByTestId("statusbar")).toContainText("Ln: 120");

  await page.reload();

  await expect(page.getByTestId("statusbar")).toContainText("Ln: 120");
  await expect
    .poll(() => page.locator(".cm-scroller").evaluate((el) => el.scrollTop))
    .toBeGreaterThan(1000);
});
