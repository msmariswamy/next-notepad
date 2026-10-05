import { expect, test, type Page } from "@playwright/test";

const bar = (page: Page) => page.getByTestId("menubar");
const content = (page: Page) => page.locator("#editor .cm-content");
const lines = (page: Page) => page.locator("#editor .cm-line");

async function menu(page: Page, title: string, id: string) {
  await bar(page).locator(".menu-title", { hasText: new RegExp(`^${title}$`) }).click();
  await bar(page).locator(`[data-command="${id}"]`).click();
}

async function type(page: Page, text: string) {
  await content(page).click();
  await page.keyboard.insertText(text);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test.describe("XML menu", () => {
  test("Format with 2 spaces, then Compact undoes the layout", async ({ page }) => {
    await type(page, "<a><b>x</b></a>");
    await menu(page, "XML", "xml.format2");
    await expect(lines(page)).toHaveText(["<a>", "  <b>x</b>", "</a>"]);
    await expect(page.getByTestId("statusbar")).toContainText("XML");
    await menu(page, "XML", "xml.compact");
    await expect(lines(page)).toHaveText(["<a><b>x</b></a>"]);
  });

  test("Format with tabs", async ({ page }) => {
    await type(page, "<a><b>x</b></a>");
    await menu(page, "XML", "xml.formatTabs");
    await expect(lines(page).nth(1)).toHaveText("\t<b>x</b>");
  });

  test("Sort Attributes", async ({ page }) => {
    await type(page, '<a z="1" b="2" a="3"/>');
    await menu(page, "XML", "xml.sortAttributes");
    await expect(content(page)).toHaveText('<a a="3" b="2" z="1"/>');
  });

  test("Escape then Unescape round-trips the selection", async ({ page }) => {
    await type(page, 'a < b && "c"');
    await page.keyboard.press("Meta+a");
    await menu(page, "XML", "xml.escape");
    await expect(content(page)).toHaveText("a &lt; b &amp;&amp; &quot;c&quot;");
    await menu(page, "XML", "xml.unescape");
    await expect(content(page)).toHaveText('a < b && "c"');
  });

  test("Validate a broken document reports the line and moves the caret there", async ({ page }) => {
    await type(page, "<a>\n<b></a>");
    await menu(page, "XML", "xml.validate");
    await expect(page.getByTestId("toast")).toContainText(/Invalid XML: Line 2/);
    await expect(page.getByTestId("statusbar")).toContainText("Ln: 2");
  });

  test("Validate a good document says so", async ({ page }) => {
    await type(page, "<a><b/></a>");
    await menu(page, "XML", "xml.validate");
    await expect(page.getByTestId("toast")).toContainText("XML is valid");
  });

  test("Compact refuses invalid XML and leaves it alone", async ({ page }) => {
    await type(page, "<a><b></a>");
    await menu(page, "XML", "xml.compact");
    await expect(content(page)).toHaveText("<a><b></a>");
    await expect(page.getByTestId("toast")).toContainText(/Cannot compact XML/);
  });

  test("the live underline appears for an XML tab and clears when fixed", async ({ page }) => {
    await menu(page, "Language", "lang.XML");
    await type(page, "<a><b></a>");
    await expect(page.locator(".cm-xml-error")).toHaveCount(1);
    await page.keyboard.press("Meta+a");
    await page.keyboard.insertText("<a><b/></a>");
    await expect(page.locator(".cm-xml-error")).toHaveCount(0);
  });
});

test.describe("YAML menu", () => {
  test("Sort Keys sorts at every depth and keeps a comment with its key", async ({ page }) => {
    await type(page, "b: 1\n# about a\na:\n  z: 1\n  y: 2");
    await menu(page, "YAML", "yaml.sortKeys");
    await expect(lines(page)).toHaveText(["# about a", "a:", "  y: 2", "  z: 1", "b: 1"]);
    await expect(page.getByTestId("statusbar")).toContainText("YAML");
  });

  test("Compact writes flow style and says comments were dropped", async ({ page }) => {
    await type(page, "# top\na: 1\nb:\n  - x\n  - y");
    await menu(page, "YAML", "yaml.compact");
    await expect(content(page)).toHaveText("{ a: 1, b: [ x, y ] }");
    await expect(page.getByTestId("toast")).toContainText("comments were dropped");
  });

  test("Compact refuses several documents and leaves them alone", async ({ page }) => {
    await type(page, "a: 1\n---\nb: 2");
    await menu(page, "YAML", "yaml.compact");
    await expect(page.getByTestId("toast")).toContainText(/several documents/i);
    await expect(lines(page)).toHaveText(["a: 1", "---", "b: 2"]);
  });

  test("Format with 4 spaces", async ({ page }) => {
    await type(page, "a:\n  b: 1");
    await menu(page, "YAML", "yaml.format4");
    await expect(lines(page).nth(1)).toHaveText("    b: 1");
  });

  test("Validate a broken document reports the error", async ({ page }) => {
    await type(page, "a: 1\na: 2");
    await menu(page, "YAML", "yaml.validate");
    await expect(page.getByTestId("toast")).toContainText(/Invalid YAML: Line 2/);
  });

  test("the live underline appears for a YAML tab", async ({ page }) => {
    await menu(page, "Language", "lang.YAML");
    await type(page, "a: 1\na: 2");
    await expect(page.locator(".cm-yaml-error")).toHaveCount(1);
  });

  test("Sort Keys on an indented selection keeps the surrounding text", async ({ page }) => {
    await type(page, "root:\n  b: 1\n  a: 2\nafter: 3");
    // Select the two indented lines: from the start of line 2 to the end of line 3.
    await page.keyboard.press("Meta+ArrowUp");
    await page.keyboard.press("ArrowDown");
    // Home goes to the first non-blank character; a second press reaches the true start of the line.
    await page.keyboard.press("Home");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Shift+End");
    await menu(page, "YAML", "yaml.sortKeys");
    await expect(lines(page)).toHaveText(["root:", "  a: 2", "  b: 1", "after: 3"]);
  });
});
