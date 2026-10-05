import { expect, test, type Page } from "@playwright/test";

const content = (page: Page) => page.locator("#editor .cm-content");
const tabs = (page: Page) => page.locator(".tab .tab-title");
const log = (page: Page) => page.evaluate(() => window.__nextNotepadTest!.log);
const request = (page: Page, req: { id: number; paths: string[]; wait: boolean }) => page.evaluate((r) => window.__nextNotepadTest!.open(r), req);

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

test("the frontend says it is ready once it can receive requests", async ({ page }) => {
  expect(await log(page)).toEqual(["ready"]);
});

test("a request opens the file in a tab and answers ok", async ({ page }) => {
  await createFile(page, "/work/a.txt", "hello from a");
  await request(page, { id: 1, paths: ["/work/a.txt"], wait: false });
  await expect(tabs(page).filter({ hasText: "a.txt" })).toHaveCount(1);
  await expect(content(page)).toHaveText("hello from a");
  expect(await log(page)).toContain("opened:1");
});

test("the same file requested again is focused, not opened twice", async ({ page }) => {
  await createFile(page, "/work/a.txt", "aaa");
  await request(page, { id: 1, paths: ["/work/a.txt"], wait: false });
  await page.locator(".tab-new, [aria-label='New tab']").first().click();
  await request(page, { id: 2, paths: ["/work/a.txt"], wait: false });
  await expect(tabs(page).filter({ hasText: "a.txt" })).toHaveCount(1);
  await expect(page.locator(".tab.active .tab-title")).toHaveText("a.txt");
  expect(await log(page)).toContain("opened:2");
});

test("a path that does not exist opens an empty tab bound to it", async ({ page }) => {
  await request(page, { id: 1, paths: ["/work/new.yaml"], wait: false });
  await expect(page.locator(".tab.active .tab-title")).toHaveText("new.yaml");
  await expect(content(page)).toHaveText("");
  await expect(page.getByTestId("statusbar")).toContainText("YAML");
});

test("several files in one request all open", async ({ page }) => {
  await createFile(page, "/work/a.txt", "a");
  await createFile(page, "/work/b.txt", "b");
  await request(page, { id: 1, paths: ["/work/a.txt", "/work/b.txt"], wait: false });
  await expect(tabs(page).filter({ hasText: /^(a|b)\.txt$/ })).toHaveCount(2);
});

test.describe("Help > Command Line Tool", () => {
  async function openDialog(page: Page) {
    await page.getByTestId("menubar").locator(".menu-title", { hasText: /^Help$/ }).click();
    await page.getByTestId("menubar").locator('[data-command="help.commandLine"]').click();
  }

  test("shows the executable path and the KUBE_EDITOR line", async ({ page }) => {
    await openDialog(page);
    await expect(page.getByTestId("cli-exe-path")).toContainText("next-notepad");
    await expect(page.getByTestId("cli-setting")).toContainText("export KUBE_EDITOR=");
    await expect(page.getByTestId("cli-setting")).toContainText("--wait");
  });

  test("Install reports the link and the setting switches to the bare command", async ({ page }) => {
    await openDialog(page);
    await page.getByTestId("cli-install").click();
    await expect(page.getByTestId("cli-install-result")).toContainText("/usr/local/bin/next-notepad");
    await expect(page.getByTestId("cli-setting")).toHaveText('export KUBE_EDITOR="next-notepad --wait"');
  });

  test("Copy puts the setting on the clipboard and confirms", async ({ page }) => {
    await openDialog(page);
    await page.getByTestId("cli-copy").last().click();
    await expect(page.getByTestId("toast")).toContainText(/copied/i);
  });

  test("closes", async ({ page }) => {
    await openDialog(page);
    await page.getByTestId("cli-close").click();
    await expect(page.getByTestId("cli-dialog")).toHaveCount(0);
  });
});
