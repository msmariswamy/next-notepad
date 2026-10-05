import { expect, test, type Page } from "@playwright/test";

const bar = (page: Page) => page.getByTestId("menubar");
const content = (page: Page) => page.locator(".cm-content");

async function menuItem(page: Page, menu: string, id: string, submenu?: string) {
  await bar(page).locator(".menu-title", { hasText: new RegExp(`^${menu}$`) }).click();
  if (submenu) await bar(page).locator(`[data-submenu="${submenu}"]`).hover();
  await bar(page).locator(`[data-command="${id}"]`).click();
}

async function typeLines(page: Page, ...lines: string[]) {
  await content(page).click();
  for (const [i, line] of lines.entries()) {
    if (i > 0) await page.keyboard.press("Enter");
    await page.keyboard.insertText(line);
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test.describe("Convert Case to", () => {
  test("UPPERCASE and lowercase on the selection", async ({ page }) => {
    await typeLines(page, "Hello World");
    await page.keyboard.press("Meta+a");
    await menuItem(page, "Edit", "case.upper", "Convert Case to");
    await expect(content(page)).toHaveText("HELLO WORLD");
    await menuItem(page, "Edit", "case.lower", "Convert Case to");
    await expect(content(page)).toHaveText("hello world");
  });

  test("Proper Case and iNVERT cASE", async ({ page }) => {
    await typeLines(page, "hELLO wORLD");
    await page.keyboard.press("Meta+a");
    await menuItem(page, "Edit", "case.proper", "Convert Case to");
    await expect(content(page)).toHaveText("Hello World");
    await menuItem(page, "Edit", "case.invert", "Convert Case to");
    await expect(content(page)).toHaveText("hELLO wORLD");
  });

  test("Cmd+Shift+U shortcut", async ({ page }) => {
    await typeLines(page, "abc");
    await page.keyboard.press("Meta+a");
    await page.keyboard.press("Meta+Shift+u");
    await expect(content(page)).toHaveText("ABC");
  });
});

test.describe("Line Operations", () => {
  test("Remove Duplicate Lines, then one undo restores them", async ({ page }) => {
    await typeLines(page, "a", "b", "a", "c", "b");
    await menuItem(page, "Edit", "line.removeDuplicates", "Line Operations");
    await expect(page.locator(".cm-line")).toHaveText(["a", "b", "c"]);
    await content(page).click(); // the menu click moved focus out of the editor
    await page.keyboard.press("Meta+z");
    await expect(page.locator(".cm-line")).toHaveCount(5);
  });

  test("Sort Lines As Integers Ascending", async ({ page }) => {
    await typeLines(page, "10", "9", "100");
    await menuItem(page, "Edit", "sort.integer.asc", "Line Operations");
    await expect(page.locator(".cm-line")).toHaveText(["9", "10", "100"]);
  });

  test("Sort Lines Lexicographically Descending", async ({ page }) => {
    await typeLines(page, "b", "C", "a");
    await menuItem(page, "Edit", "sort.lex.desc", "Line Operations");
    await expect(page.locator(".cm-line")).toHaveText(["b", "a", "C"]);
  });

  test("Join Lines and Reverse Line Order", async ({ page }) => {
    await typeLines(page, "1", "2", "3");
    await menuItem(page, "Edit", "line.reverse", "Line Operations");
    await expect(page.locator(".cm-line")).toHaveText(["3", "2", "1"]);
    await page.keyboard.press("Meta+a");
    await menuItem(page, "Edit", "line.join", "Line Operations");
    await expect(content(page)).toHaveText("3 2 1");
  });

  test("Alt+Down moves the current line down", async ({ page }) => {
    await typeLines(page, "a", "b");
    await page.keyboard.press("Meta+ArrowUp");
    await page.keyboard.press("Alt+ArrowDown");
    await expect(page.locator(".cm-line")).toHaveText(["b", "a"]);
  });

  test("Remove Empty Lines", async ({ page }) => {
    await typeLines(page, "a", "", "b");
    await menuItem(page, "Edit", "line.removeEmpty", "Line Operations");
    await expect(page.locator(".cm-line")).toHaveText(["a", "b"]);
  });
});

test.describe("Blank Operations", () => {
  test("Trim Trailing Space", async ({ page }) => {
    await typeLines(page, "a   ", "b ");
    await menuItem(page, "Edit", "blank.trimTrailing", "Blank Operations");
    await expect(page.locator(".cm-line")).toHaveText(["a", "b"]);
  });

  test("TAB to Space and Space to TAB (Leading)", async ({ page }) => {
    await typeLines(page, "\tx");
    await menuItem(page, "Edit", "blank.tabToSpace", "Blank Operations");
    await expect(content(page)).toHaveText("    x");
    await menuItem(page, "Edit", "blank.spaceToTabLeading", "Blank Operations");
    await expect(content(page)).toHaveText("\tx");
  });

  test("EOL to Space", async ({ page }) => {
    await typeLines(page, "a", "b", "c");
    await menuItem(page, "Edit", "blank.eolToSpace", "Blank Operations");
    await expect(content(page)).toHaveText("a b c");
  });
});

test.describe("Indent and comments", () => {
  test("Tab inserts spaces to the next tab stop; Settings tab width applies", async ({ page }) => {
    await content(page).click();
    await page.keyboard.insertText("ab");
    await page.keyboard.press("Tab");
    await expect(content(page)).toHaveText("ab  ");
    await page.keyboard.press("Meta+,");
    await page.locator('input[name="tabWidth"]').fill("8");
    await page.locator('input[name="tabWidth"]').blur();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.locator(".cm-content").click();
    await page.keyboard.press("Meta+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Tab");
    await expect(content(page)).toHaveText(" ".repeat(8));
  });

  test("use-tabs setting inserts a tab character", async ({ page }) => {
    await page.keyboard.press("Meta+,");
    await page.locator('input[name="useTabs"]').check();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await content(page).click();
    await page.keyboard.press("Tab");
    await expect(content(page)).toHaveText("\t");
  });

  test("Indent and Outdent act on the selected lines", async ({ page }) => {
    await typeLines(page, "a", "b");
    await page.keyboard.press("Meta+a");
    await menuItem(page, "Edit", "indent.more", "Indent");
    await expect(page.locator(".cm-line")).toHaveText(["    a", "    b"]);
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator(".cm-line")).toHaveText(["a", "b"]);
  });

  test("Toggle Single Line Comment in JavaScript", async ({ page }) => {
    await typeLines(page, "a", "b");
    await bar(page).locator(".menu-title", { hasText: /^Language$/ }).click();
    await bar(page).locator('[data-command="lang.JavaScript"]').click();
    await page.keyboard.press("Meta+a");
    await menuItem(page, "Edit", "comment.line", "Comment/Uncomment");
    await expect(page.locator(".cm-line")).toHaveText(["// a", "// b"]);
    await menuItem(page, "Edit", "comment.line", "Comment/Uncomment");
    await expect(page.locator(".cm-line")).toHaveText(["a", "b"]);
  });
});

test.describe("View options", () => {
  test("Word Wrap wraps long lines without changing the text", async ({ page }) => {
    const long = "word ".repeat(400).trim();
    await typeLines(page, long);
    await menuItem(page, "View", "view.wordWrap");
    await expect(content(page)).toHaveClass(/cm-lineWrapping/);
    await expect(content(page)).toHaveText(long);
  });

  test("Show All Characters marks line endings, spaces and tabs", async ({ page }) => {
    await typeLines(page, "a b\tc", "d", "e");
    await menuItem(page, "View", "view.showAllCharacters");
    await expect(page.locator(".cm-eol")).toHaveCount(2);
    await expect(page.locator(".cm-eol").first()).toHaveText("LF");
    await expect(page.locator(".cm-ws-space")).toHaveCount(1);
    await expect(page.locator(".cm-ws-tab")).toHaveCount(1);
  });

  test("the line-ending marker follows Encoding > Windows (CR LF)", async ({ page }) => {
    await typeLines(page, "a", "b");
    await menuItem(page, "View", "view.showAllCharacters");
    await menuItem(page, "Encoding", "eol.crlf");
    await expect(page.locator(".cm-eol").first()).toHaveText("CRLF");
  });

  test("Show All Characters is checked in the menu and persists across a reload", async ({ page }) => {
    await menuItem(page, "View", "view.showAllCharacters");
    await bar(page).locator(".menu-title", { hasText: /^View$/ }).click();
    await expect(bar(page).locator('[data-command="view.showAllCharacters"]')).toHaveAttribute("aria-checked", "true");
  });
});

test.describe("Bookmarked lines", () => {
  async function bookmark(page: Page, ...lines: number[]) {
    for (const n of lines) {
      await page.locator(".cm-line").nth(n - 1).click();
      await page.keyboard.press("Meta+F2");
    }
  }

  test("Remove Bookmarked Lines", async ({ page }) => {
    await typeLines(page, "a", "b", "c");
    await bookmark(page, 2);
    await menuItem(page, "Search", "bm.remove", "Bookmark");
    await expect(page.locator(".cm-line")).toHaveText(["a", "c"]);
  });

  test("Remove Non-Bookmarked Lines", async ({ page }) => {
    await typeLines(page, "a", "b", "c");
    await bookmark(page, 2);
    await menuItem(page, "Search", "bm.removeNon", "Bookmark");
    await expect(page.locator(".cm-line")).toHaveText(["b"]);
  });

  test("Cut Bookmarked Lines, then Paste to (Replace) Bookmarked Lines", async ({ page }) => {
    await typeLines(page, "a", "b", "c");
    await bookmark(page, 1, 3);
    await menuItem(page, "Search", "bm.cut", "Bookmark");
    await expect(page.locator(".cm-line")).toHaveText(["b"]);
    await bookmark(page, 1);
    await menuItem(page, "Search", "bm.paste", "Bookmark");
    await expect(page.locator(".cm-line")).toHaveText(["a", "c"]);
  });

  test("Inverse Bookmarks", async ({ page }) => {
    await typeLines(page, "a", "b", "c");
    await bookmark(page, 2);
    await menuItem(page, "Search", "bm.inverse", "Bookmark");
    await expect(page.locator(".cm-bookmark:visible")).toHaveCount(2);
  });

  test("with no bookmarks a message is shown and nothing changes", async ({ page }) => {
    await typeLines(page, "a", "b");
    await menuItem(page, "Search", "bm.remove", "Bookmark");
    await expect(page.getByTestId("toast")).toHaveText("No bookmarked lines");
    await expect(page.locator(".cm-line")).toHaveCount(2);
  });
});
