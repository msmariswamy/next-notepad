import { expect, test, type Page } from "@playwright/test";

const content = (page: Page) => page.locator("#editor .cm-content");
const tabs = (page: Page) => page.locator(".tab .tab-title");
const drop = (page: Page, paths: string[]) => page.evaluate((p) => window.__nextNotepadDrop!(p), paths);

/** Put a file into the in-memory host: type, Save As with a path answered through the prompt, then close its tab. */
async function createFile(page: Page, path: string, text: string) {
  page.once("dialog", (d) => void d.accept(path));
  await content(page).click();
  await page.keyboard.insertText(text);
  await page.keyboard.press("Meta+s");
  await expect(tabs(page).first()).toHaveText(path.split("/").pop()!);
  await page.locator(".tab-close").first().click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("dropping a file opens it in a tab and makes it active", async ({ page }) => {
  await createFile(page, "/work/notes.txt", "dropped text");
  await drop(page, ["/work/notes.txt"]);
  await expect(page.locator(".tab.active .tab-title")).toHaveText("notes.txt");
  await expect(content(page)).toHaveText("dropped text");
});

test("dropping several files opens them in drop order and activates the last", async ({ page }) => {
  await createFile(page, "/work/a.txt", "a");
  await createFile(page, "/work/b.txt", "b");
  await createFile(page, "/work/c.txt", "c");
  await drop(page, ["/work/a.txt", "/work/b.txt", "/work/c.txt"]);
  await expect(tabs(page).filter({ hasText: /^[abc]\.txt$/ })).toHaveText(["a.txt", "b.txt", "c.txt"]);
  await expect(page.locator(".tab.active .tab-title")).toHaveText("c.txt");
});

test("a file that is already open is focused, not opened twice", async ({ page }) => {
  await createFile(page, "/work/a.txt", "aaa");
  await createFile(page, "/work/b.txt", "bbb");
  await drop(page, ["/work/a.txt", "/work/b.txt"]);
  await expect(page.locator(".tab.active .tab-title")).toHaveText("b.txt");
  await drop(page, ["/work/a.txt"]);
  await expect(tabs(page).filter({ hasText: "a.txt" })).toHaveCount(1);
  await expect(page.locator(".tab.active .tab-title")).toHaveText("a.txt");
});

test("the same file twice in one drop opens one tab", async ({ page }) => {
  await createFile(page, "/work/a.txt", "a");
  await drop(page, ["/work/a.txt", "/work/a.txt"]);
  await expect(tabs(page).filter({ hasText: "a.txt" })).toHaveCount(1);
});

test("a path that cannot be opened is reported and the other files still open", async ({ page }) => {
  await createFile(page, "/work/a.txt", "a");
  await createFile(page, "/work/b.txt", "b");
  await drop(page, ["/work/a.txt", "/work/gone", "/work/b.txt"]);
  await expect(page.getByTestId("toast")).toContainText("cannot open /work/gone");
  await expect(tabs(page).filter({ hasText: /^[ab]\.txt$/ })).toHaveCount(2);
  await expect(page.locator(".tab.active .tab-title")).toHaveText("b.txt");
});

test("the language comes from the file name", async ({ page }) => {
  await createFile(page, "/work/config.yaml", "a: 1");
  await drop(page, ["/work/config.yaml"]);
  await expect(page.getByTestId("statusbar")).toContainText("YAML");
});

test("a real OS file drop on the plain browser page opens no tab", async ({ page }) => {
  const before = await tabs(page).count();
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(["from the OS"], "outside.txt", { type: "text/plain" }));
    const target = document.getElementById("tabs")!;
    target.dispatchEvent(new DragEvent("dragover", { dataTransfer: data, bubbles: true, cancelable: true }));
    target.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(300);
  await expect(tabs(page)).toHaveCount(before);
  await expect(tabs(page).filter({ hasText: "outside.txt" })).toHaveCount(0);
});

test("dragging a tab to a new position still reorders the tabs and opens no file", async ({ page }) => {
  await createFile(page, "/work/a.txt", "a");
  await createFile(page, "/work/b.txt", "b");
  await drop(page, ["/work/a.txt", "/work/b.txt"]);
  const order = async () => (await tabs(page).allTextContents()).filter((t) => /^[ab]\.txt$/.test(t));
  expect(await order()).toEqual(["a.txt", "b.txt"]);
  const count = await tabs(page).count();
  await page.locator(".tab", { hasText: "b.txt" }).dragTo(page.locator(".tab", { hasText: "a.txt" }));
  await expect.poll(order).toEqual(["b.txt", "a.txt"]);
  await expect(tabs(page)).toHaveCount(count);
});
