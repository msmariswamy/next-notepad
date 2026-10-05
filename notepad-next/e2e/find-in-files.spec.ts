import { expect, test, type Page } from "@playwright/test";

const dialog = (page: Page) => page.getByTestId("find-dialog");
const message = (page: Page) => page.getByTestId("find-message");

async function seed(page: Page, files: Record<string, string>) {
  await page.evaluate((f) => {
    const mem = (window as unknown as { __memoryFiles: Map<string, string> }).__memoryFiles;
    mem.clear();
    for (const [k, v] of Object.entries(f)) mem.set(k, v);
  }, files);
}

const fixture = {
  "/proj/a.txt": "TODO first\nnothing",
  "/proj/notes.md": "a TODO here",
  "/proj/sub/deep.txt": "deep TODO\nfoobar foobaz",
  "/proj/.git/hidden.txt": "TODO hidden",
  "/other/outside.txt": "TODO outside",
};

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await seed(page, fixture);
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+f");
});

async function openFilesTab(page: Page) {
  await dialog(page).locator('[data-tab="files"]').click();
  await dialog(page).locator('[name="directory"]').fill("/proj");
}

test("Find in Files lists hits grouped by file, skipping hidden folders", async ({ page }) => {
  await openFilesTab(page);
  await dialog(page).locator('[name="findWhat"]').fill("TODO");
  await dialog(page).getByRole("button", { name: "Find All" }).click();
  await expect(page.getByTestId("results")).toContainText('Search "TODO" (3 hits in 3 files)');
  await expect(page.locator(".results-doc")).toHaveText(["/proj/a.txt (1 hit)", "/proj/notes.md (1 hit)", "/proj/sub/deep.txt (1 hit)"]);
});

test("the name filter limits which files are searched", async ({ page }) => {
  await openFilesTab(page);
  await dialog(page).locator('[name="filesFilters"]').fill("*.md");
  await dialog(page).locator('[name="findWhat"]').fill("TODO");
  await dialog(page).getByRole("button", { name: "Find All" }).click();
  await expect(page.locator(".results-doc")).toHaveText(["/proj/notes.md (1 hit)"]);
});

test("turning off sub-folders searches only the directory itself", async ({ page }) => {
  await openFilesTab(page);
  await dialog(page).locator('[name="filesRecursive"]').uncheck();
  await dialog(page).locator('[name="findWhat"]').fill("TODO");
  await dialog(page).getByRole("button", { name: "Find All" }).click();
  await expect(page.getByTestId("results")).toContainText("(2 hits in 2 files)");
});

test("hidden folders are searched when enabled", async ({ page }) => {
  await openFilesTab(page);
  await dialog(page).locator('[name="filesHidden"]').check();
  await dialog(page).locator('[name="findWhat"]').fill("TODO");
  await dialog(page).getByRole("button", { name: "Find All" }).click();
  await expect(page.getByTestId("results")).toContainText("(4 hits in 4 files)");
});

test("a lookahead pattern works through the JS fallback", async ({ page }) => {
  await openFilesTab(page);
  await dialog(page).locator('input[name="mode"][value="regex"]').check();
  await dialog(page).locator('[name="findWhat"]').fill("foo(?=bar)");
  await dialog(page).getByRole("button", { name: "Find All" }).click();
  await expect(page.getByTestId("results")).toContainText('(1 hit in 1 file)');
  await expect(page.locator(".results-hit")).toContainText("foobar foobaz");
});

test("clicking a result opens the file and selects the match", async ({ page }) => {
  await openFilesTab(page);
  await dialog(page).locator('[name="findWhat"]').fill("TODO");
  await dialog(page).getByRole("button", { name: "Find All" }).click();
  await page.locator(".results-hit", { hasText: "a TODO here" }).click();
  await expect(page.locator(".tab.active .tab-title")).toHaveText("notes.md");
  await expect(page.getByTestId("statusbar")).toContainText("Sel: 4");
});

test("an invalid regex is reported inline", async ({ page }) => {
  await openFilesTab(page);
  await dialog(page).locator('input[name="mode"][value="regex"]').check();
  await dialog(page).locator('[name="findWhat"]').fill("(bad");
  await dialog(page).getByRole("button", { name: "Find All" }).click();
  await expect(message(page)).toContainText("Invalid regular expression");
});

test("Replace in Files asks for confirmation showing the file count, then writes", async ({ page }) => {
  await openFilesTab(page);
  await dialog(page).locator('[name="findWhat"]').fill("TODO");
  await dialog(page).locator('[name="replaceWith"]').fill("DONE");
  await dialog(page).getByRole("button", { name: "Replace in Files" }).click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("Replace in 3 files?");
  await page.getByTestId("confirm-dialog").getByRole("button", { name: "Replace", exact: true }).click();
  await expect(message(page)).toHaveText("Replace in Files: 3 occurrences replaced in 3 files");
  const text = await page.evaluate(() => (window as unknown as { __memoryFiles: Map<string, string> }).__memoryFiles.get("/proj/a.txt"));
  expect(text).toBe("DONE first\nnothing");
});

test("declining the confirmation leaves the files untouched", async ({ page }) => {
  await openFilesTab(page);
  await dialog(page).locator('[name="findWhat"]').fill("TODO");
  await dialog(page).locator('[name="replaceWith"]').fill("DONE");
  await dialog(page).getByRole("button", { name: "Replace in Files" }).click();
  await page.getByTestId("confirm-dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(message(page)).toHaveText("Replace in Files: nothing changed");
  const text = await page.evaluate(() => (window as unknown as { __memoryFiles: Map<string, string> }).__memoryFiles.get("/proj/a.txt"));
  expect(text).toBe("TODO first\nnothing");
});

test("Find in Projects is disabled until a folder is opened", async ({ page }) => {
  await dialog(page).locator('[data-tab="projects"]').click();
  await expect(dialog(page).getByTestId("project-root")).toContainText("No folder opened");
  await expect(dialog(page).locator(".find-panel-projects").getByRole("button", { name: "Find All" })).toBeDisabled();
});

test("Find in Projects searches the folder chosen with Open Folder", async ({ page }) => {
  await dialog(page).locator('[data-tab="projects"]').click();
  page.once("dialog", (d) => d.accept("/proj"));
  await dialog(page).getByRole("button", { name: "Open Folder…" }).click();
  await expect(dialog(page).getByTestId("project-root")).toHaveText("/proj");
  await dialog(page).locator('[name="findWhat"]').fill("TODO");
  await dialog(page).locator(".find-panel-projects").getByRole("button", { name: "Find All" }).click();
  await expect(page.getByTestId("results")).toContainText("(3 hits in 3 files)");
  await expect(page.getByTestId("results")).not.toContainText("/other/outside.txt");
});
