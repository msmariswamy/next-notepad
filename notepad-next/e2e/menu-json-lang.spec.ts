import { expect, test, type Page } from "@playwright/test";

const menu = (page: Page, title: string) => page.getByTestId("menubar").locator(".menu-title", { hasText: new RegExp(`^${title}$`) });
const item = (page: Page, id: string) => page.getByTestId("menubar").locator(`[data-command="${id}"]`);

async function choose(page: Page, title: string, id: string) {
  await menu(page, title).click();
  await item(page, id).click();
}

async function typeInEditor(page: Page, text: string) {
  await page.locator(".cm-content").click();
  await page.keyboard.insertText(text);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test.describe("menu bar", () => {
  test("shows all eight menus", async ({ page }) => {
    const titles = await page.getByTestId("menubar").locator(".menu-title").allTextContents();
    expect(titles).toEqual(["File", "Edit", "Search", "View", "Encoding", "Language", "JSON", "Settings"]);
  });

  test("File > New opens a second tab", async ({ page }) => {
    await choose(page, "File", "file.new");
    await expect(page.locator(".tab")).toHaveCount(2);
  });

  test("a menu shows the shortcut next to each command", async ({ page }) => {
    await menu(page, "File").click();
    await expect(item(page, "file.save").locator("kbd")).toHaveText(/S$/);
  });

  test("Search > Find… opens the Find dialog", async ({ page }) => {
    await choose(page, "Search", "search.find");
    await expect(page.getByTestId("find-dialog")).toBeVisible();
  });

  test("Settings > Preferences… opens settings", async ({ page }) => {
    await choose(page, "Settings", "settings.open");
    await expect(page.getByTestId("settings-dialog")).toBeVisible();
  });

  test("Escape closes an open menu", async ({ page }) => {
    await menu(page, "File").click();
    await expect(page.locator(".menu.open")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(".menu.open")).toHaveCount(0);
  });
});

test.describe("encoding and line endings", () => {
  test("Encoding > Windows (CR LF) updates the status bar and marks the tab modified", async ({ page }) => {
    await choose(page, "Encoding", "eol.crlf");
    await expect(page.getByTestId("statusbar")).toContainText("Windows (CR LF)");
    await expect(page.locator(".tab.dirty")).toHaveCount(1);
  });

  test("the current encoding is checked in the menu", async ({ page }) => {
    await menu(page, "Encoding").click();
    await expect(item(page, "enc.utf8")).toHaveAttribute("aria-checked", "true");
    await item(page, "enc.utf16le").click();
    await expect(page.getByTestId("statusbar")).toContainText("UTF-16LE");
  });
});

test.describe("JSON tools", () => {
  test("JSON > Pretty-print formats the document", async ({ page }) => {
    await typeInEditor(page, '{"a":1,"b":[1,2]}');
    await choose(page, "JSON", "json.pretty");
    await expect(page.locator(".cm-line")).toHaveCount(7);
    await expect(page.getByTestId("toast")).toHaveText("JSON formatted");
  });

  test("JSON > Minify puts it back on one line", async ({ page }) => {
    await typeInEditor(page, '{\n  "a": 1\n}');
    await choose(page, "JSON", "json.minify");
    await expect(page.locator(".cm-content")).toHaveText('{"a":1}');
  });

  test("one undo reverts a format", async ({ page }) => {
    await typeInEditor(page, '{"a":1}');
    await choose(page, "JSON", "json.pretty");
    await page.locator(".cm-content").click();
    await page.keyboard.press("Meta+z");
    await expect(page.locator(".cm-content")).toHaveText('{"a":1}');
  });

  test("Validate reports line and column, moves the caret there and leaves the text alone", async ({ page }) => {
    await typeInEditor(page, '{\n  "a": 1\n  "b": 2\n}');
    await choose(page, "JSON", "json.validate");
    await expect(page.getByTestId("toast")).toContainText("Line 3, column 3");
    await expect(page.getByTestId("statusbar")).toContainText("Ln: 3");
    await expect(page.locator(".cm-line")).toHaveCount(4);
  });

  test("Validate says so when the JSON is valid", async ({ page }) => {
    await typeInEditor(page, '{"ok": true}');
    await choose(page, "JSON", "json.validate");
    await expect(page.getByTestId("toast")).toHaveText("JSON is valid");
  });

  test("invalid JSON is not modified by Pretty-print", async ({ page }) => {
    await typeInEditor(page, '{"a":');
    await choose(page, "JSON", "json.pretty");
    await expect(page.locator(".cm-content")).toHaveText('{"a":');
    await expect(page.getByTestId("toast")).toContainText("Line 1");
  });

  test("Cmd+Alt+J formats from the keyboard", async ({ page }) => {
    await typeInEditor(page, '{"a":1}');
    await page.keyboard.press("Meta+Alt+j");
    await expect(page.locator(".cm-line")).toHaveCount(3);
  });
});

test.describe("syntax highlighting", () => {
  test("Language > JSON highlights keys and numbers", async ({ page }) => {
    await typeInEditor(page, '{"a": 1}');
    await choose(page, "Language", "lang.JSON");
    await expect(page.locator(".cm-content .tok-propertyName")).toHaveCount(1);
    await expect(page.locator(".cm-content .tok-number")).toHaveCount(1);
    await expect(page.getByTestId("statusbar")).toContainText("JSON");
  });

  test("choosing Normal text removes the highlighting", async ({ page }) => {
    await typeInEditor(page, '{"a": 1}');
    await choose(page, "Language", "lang.JSON");
    await expect(page.locator(".cm-content .tok-number")).toHaveCount(1);
    await choose(page, "Language", "lang.Normal text");
    await expect(page.locator(".cm-content .tok-number")).toHaveCount(0);
  });

  test("Rust keywords are highlighted", async ({ page }) => {
    await typeInEditor(page, "fn main() {}");
    await choose(page, "Language", "lang.Rust");
    await expect(page.locator(".cm-content .tok-keyword").first()).toBeVisible();
  });

  test("each tab keeps its own language", async ({ page }) => {
    await typeInEditor(page, '{"a": 1}');
    await choose(page, "Language", "lang.JSON");
    await page.getByLabel("New tab").click();
    await expect(page.locator(".cm-content .tok-number")).toHaveCount(0);
    await page.locator(".tab", { hasText: "new 1" }).click();
    await expect(page.locator(".cm-content .tok-number")).toHaveCount(1);
  });

  test("switching theme recolours tokens without touching the document", async ({ page }) => {
    await typeInEditor(page, '{"a": 1}');
    await choose(page, "Language", "lang.JSON");
    const colour = () => page.locator(".cm-content .tok-number").evaluate((el) => getComputedStyle(el).color);
    await choose(page, "View", "view.theme.light");
    const light = await colour();
    await choose(page, "View", "view.theme.dark");
    const dark = await colour();
    expect(dark).not.toBe(light);
    await expect(page.locator(".cm-content")).toHaveText('{"a": 1}');
  });

  test("the language survives a relaunch (session restore)", async ({ page }) => {
    await typeInEditor(page, '{"a": 1}');
    await choose(page, "Language", "lang.JSON");
    await page.reload();
    await expect(page.locator(".cm-content .tok-number")).toHaveCount(1);
  });
});

test.describe("submenus are not clipped", () => {
  test("Edit > Line Operations opens fully visible beside the parent menu", async ({ page }) => {
    await menu(page, "Edit").click();
    await page.getByTestId("menubar").locator('[data-submenu="Line Operations"]').hover();
    const parent = (await page.locator(".menu.open > .menu-dropdown").boundingBox())!;
    const nested = page.getByTestId("menubar").locator(".menu-nested:visible").first();
    await expect(nested.locator('[data-command="line.removeDuplicates"]')).toBeInViewport();
    const box = (await nested.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(parent.x + parent.width - 2); // opens to the right, not hidden inside
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    // The top-level menu itself must not scroll or clip its children.
    const overflow = await page.locator(".menu.open > .menu-dropdown").evaluate((el) => getComputedStyle(el).overflowY);
    expect(overflow).toBe("visible");
  });

  test("a tall submenu stays inside a short window", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 420 });
    await menu(page, "Edit").click();
    await page.getByTestId("menubar").locator('[data-submenu="Line Operations"]').hover();
    const box = (await page.getByTestId("menubar").locator(".menu-nested:visible").first().boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(420);
  });
});
