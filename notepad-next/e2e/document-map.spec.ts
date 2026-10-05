import { expect, test, type Page } from "@playwright/test";

const bar = (page: Page) => page.getByTestId("menubar");

async function viewMenu(page: Page, id: string) {
  await bar(page).locator(".menu-title", { hasText: /^View$/ }).click();
  await bar(page).locator(`[data-command="${id}"]`).click();
}

const scrollTop = (page: Page) => page.locator(".cm-scroller").evaluate((el) => el.scrollTop);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator(".cm-content").click();
  await page.keyboard.insertText(Array.from({ length: 400 }, (_, i) => `    line number ${i + 1}`).join("\n"));
  await viewMenu(page, "view.documentMap");
});

test("the map is drawn and highlights the visible part", async ({ page }) => {
  await expect(page.getByTestId("dm-canvas")).toBeVisible();
  // The map is drawn on a debounce after it is shown, so wait for the highlight to settle.
  await expect.poll(async () => (await page.getByTestId("dm-viewport").boundingBox())!.height).toBeGreaterThan(4);
  const box = (await page.getByTestId("dm-viewport").boundingBox())!;
  const body = (await page.getByTestId("dm-body").boundingBox())!;
  expect(box.height).toBeLessThan(body.height);
});

test("clicking near the bottom of the map scrolls the editor toward the end", async ({ page }) => {
  await page.locator(".cm-scroller").evaluate((el) => (el.scrollTop = 0));
  const before = await scrollTop(page);
  const body = (await page.getByTestId("dm-body").boundingBox())!;
  await page.mouse.click(body.x + 20, body.y + Math.min(body.height - 4, 700));
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(before + 200);
});

test("dragging the highlight scrolls the editor", async ({ page }) => {
  await page.locator(".cm-scroller").evaluate((el) => (el.scrollTop = 0));
  const body = (await page.getByTestId("dm-body").boundingBox())!;
  await page.mouse.move(body.x + 20, body.y + 10);
  await page.mouse.down();
  await page.mouse.move(body.x + 20, body.y + 200, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(100);
});
