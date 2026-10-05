import { expect, test, type Page } from "@playwright/test";

const content = (page: Page) => page.locator("#editor .cm-content");
const tabs = (page: Page) => page.locator(".tab .tab-title");
const log = (page: Page) => page.evaluate(() => window.__nextNotepadTest!.log);
const request = (page: Page, req: { id: number; paths: string[]; wait: boolean }) => page.evaluate((r) => window.__nextNotepadTest!.open(r), req);

async function createFile(page: Page, path: string, text: string) {
  page.once("dialog", (d) => void d.accept(path));
  await content(page).click();
  await page.keyboard.insertText(text);
  await page.keyboard.press("Meta+s");
  await expect(tabs(page).first()).toHaveText(path.split("/").pop()!);
  await page.locator(".tab-close").first().click();
}

const closeTab = (page: Page, title: string) => page.locator(".tab", { hasText: title }).locator(".tab-close").click();

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("a waiting request is not finished while its tab is open, and finishes when the tab closes", async ({ page }) => {
  await createFile(page, "/work/f.yaml", "a: 1");
  await request(page, { id: 7, paths: ["/work/f.yaml"], wait: true });
  expect(await log(page)).toContain("opened:7");
  expect(await log(page)).not.toContain("finish:7");
  await closeTab(page, "f.yaml");
  await expect.poll(() => log(page)).toContain("finish:7");
});

test("editing and saving does not finish the wait", async ({ page }) => {
  await createFile(page, "/work/f.yaml", "a: 1");
  await request(page, { id: 7, paths: ["/work/f.yaml"], wait: true });
  await content(page).click();
  await page.keyboard.insertText("b: 2\n");
  await page.keyboard.press("Meta+s");
  await page.waitForTimeout(300);
  expect(await log(page)).not.toContain("finish:7");
});

test("with two files it waits until both tabs are closed", async ({ page }) => {
  await createFile(page, "/work/a.txt", "a");
  await createFile(page, "/work/b.txt", "b");
  await request(page, { id: 3, paths: ["/work/a.txt", "/work/b.txt"], wait: true });
  await closeTab(page, "a.txt");
  await page.waitForTimeout(300);
  expect(await log(page)).not.toContain("finish:3");
  await closeTab(page, "b.txt");
  await expect.poll(() => log(page)).toContain("finish:3");
});

test("a request without wait is never finished by the frontend", async ({ page }) => {
  await createFile(page, "/work/a.txt", "a");
  await request(page, { id: 4, paths: ["/work/a.txt"], wait: false });
  await closeTab(page, "a.txt");
  await page.waitForTimeout(300);
  expect((await log(page)).some((l) => l.startsWith("finish"))).toBe(false);
});

test("quitting finishes every waiting request first", async ({ page }) => {
  await createFile(page, "/work/f.yaml", "a: 1");
  await request(page, { id: 9, paths: ["/work/f.yaml"], wait: true });
  await page.evaluate(() => window.__nextNotepadTest!.requestQuit!());
  expect(await log(page)).toContain("finishAll");
});

test("closing a modified tab still asks to save, and the wait ends only when it is closed", async ({ page }) => {
  await createFile(page, "/work/f.yaml", "a: 1");
  await request(page, { id: 5, paths: ["/work/f.yaml"], wait: true });
  await content(page).click();
  await page.keyboard.insertText("x");
  await closeTab(page, "f.yaml");
  await expect(page.getByTestId("confirm-unsaved")).toBeVisible();
  expect(await log(page)).not.toContain("finish:5");
  await page.getByTestId("confirm-unsaved").getByRole("button", { name: "Don't Save" }).click();
  await expect.poll(() => log(page)).toContain("finish:5");
});
