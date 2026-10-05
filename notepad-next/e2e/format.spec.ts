import { expect, test, type Page } from "@playwright/test";

const bar = (page: Page) => page.getByTestId("menubar");
const content = (page: Page) => page.locator(".cm-content");
const lines = (page: Page) => page.locator(".cm-line");

async function choose(page: Page, menu: string, id: string) {
  await bar(page).locator(".menu-title", { hasText: new RegExp(`^${menu}$`) }).click();
  await bar(page).locator(`[data-command="${id}"]`).click();
}

async function setLanguage(page: Page, name: string) {
  await choose(page, "Language", `lang.${name}`);
}

async function paste(page: Page, text: string) {
  await content(page).click();
  await page.keyboard.insertText(text);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test.describe("Format Document", () => {
  test("JavaScript", async ({ page }) => {
    await paste(page, "function f(){return 1}");
    await setLanguage(page, "JavaScript");
    await choose(page, "Edit", "format.document");
    await expect(lines(page)).toHaveText(["function f() {", "  return 1;", "}"]);
    await expect(page.getByTestId("toast")).toHaveText("Formatted as JavaScript");
  });

  test("HTML", async ({ page }) => {
    await paste(page, "<div><p>Hi</p></div>");
    await setLanguage(page, "HTML");
    await choose(page, "Edit", "format.document");
    await expect(lines(page)).toHaveText(["<div>", "  <p>Hi</p>", "</div>"]);
  });

  test("XML", async ({ page }) => {
    await paste(page, "<a><b>1</b><c/></a>");
    await setLanguage(page, "XML");
    await choose(page, "Edit", "format.document");
    await expect(lines(page)).toHaveText(["<a>", "  <b>1</b>", "  <c/>", "</a>"]);
  });

  test("YAML", async ({ page }) => {
    await paste(page, "a:   1");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("b:");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("      - x");
    await setLanguage(page, "YAML");
    await choose(page, "Edit", "format.document");
    await expect(lines(page)).toHaveText(["a: 1", "b:", "  - x"]);
  });

  test("Java", async ({ page }) => {
    await paste(page, "class A{void f(){int x=1;}}");
    await setLanguage(page, "Java");
    await choose(page, "Edit", "format.document");
    await expect(lines(page)).toHaveText(["class A {", "  void f() {", "    int x=1;", "  }", "}"]);
  });

  test("CSS", async ({ page }) => {
    await paste(page, "a{color:red}");
    await setLanguage(page, "CSS");
    await choose(page, "Edit", "format.document");
    await expect(lines(page)).toHaveText(["a {", "  color: red;", "}"]);
  });

  test("Cmd+Alt+L formats from the keyboard", async ({ page }) => {
    await paste(page, "a{color:red}");
    await setLanguage(page, "CSS");
    await content(page).click();
    await page.keyboard.press("Meta+Alt+l");
    await expect(lines(page)).toHaveCount(3);
  });

  test("a syntax error is reported, the text is untouched and the caret jumps to it", async ({ page }) => {
    await paste(page, "let a = 1;");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("function (");
    await setLanguage(page, "JavaScript");
    await choose(page, "Edit", "format.document");
    await expect(page.getByTestId("toast")).toContainText("Cannot format JavaScript: Line 2");
    await expect(lines(page)).toHaveText(["let a = 1;", "function ("]);
    await expect(page.getByTestId("statusbar")).toContainText("Ln: 2");
  });

  test("one undo restores the unformatted text", async ({ page }) => {
    await paste(page, "a{color:red}");
    await setLanguage(page, "CSS");
    await choose(page, "Edit", "format.document");
    await content(page).click();
    await page.keyboard.press("Meta+z");
    await expect(content(page)).toHaveText("a{color:red}");
  });
});

test.describe("auto-detect", () => {
  test("pasted JSON is highlighted as JSON without choosing a language", async ({ page }) => {
    await paste(page, '{"a": 1}');
    await expect(page.getByTestId("statusbar")).toContainText("JSON");
    await expect(page.locator(".cm-content .tok-number")).toHaveCount(1);
  });

  for (const [name, text, language] of [
    ["XML", '<?xml version="1.0"?><root><a/></root>', "XML"],
    ["HTML", "<!DOCTYPE html><html><body></body></html>", "HTML"],
    ["Java", "package a; public class Foo { void f() {} }", "Java"],
  ] as const) {
    test(`${name} is detected from its content`, async ({ page }) => {
      await paste(page, text);
      await expect(page.getByTestId("statusbar")).toContainText(language);
    });
  }

  test("YAML is detected from its content", async ({ page }) => {
    await paste(page, "name: app");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("items:");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("  - a");
    await expect(page.getByTestId("statusbar")).toContainText("YAML");
  });

  test("Format Document on unknown content formats after detecting", async ({ page }) => {
    await paste(page, '{"a":1,"b":[1,2]}');
    await choose(page, "Edit", "format.document");
    await expect(lines(page)).toHaveCount(7);
    await expect(page.getByTestId("statusbar")).toContainText("JSON");
  });

  test("prose stays plain text and Format says it could not detect the language", async ({ page }) => {
    await paste(page, "Meeting notes: call John tomorrow.");
    await page.waitForTimeout(500);
    await expect(page.getByTestId("statusbar")).toContainText("Normal text");
    await choose(page, "Edit", "format.document");
    await expect(page.getByTestId("toast")).toContainText("Could not detect the language");
  });

  test("a language chosen by the user is never overridden", async ({ page }) => {
    await setLanguage(page, "Python");
    await paste(page, '{"a": 1}');
    await page.waitForTimeout(600);
    await expect(page.getByTestId("statusbar")).toContainText("Python");
  });

  test("the detected language survives a relaunch", async ({ page }) => {
    await paste(page, '{"a": 1}');
    await expect(page.getByTestId("statusbar")).toContainText("JSON");
    await page.reload();
    await expect(page.getByTestId("statusbar")).toContainText("JSON");
  });
});

test.describe("JSON menu", () => {
  test("lists every JSON command", async ({ page }) => {
    await bar(page).locator(".menu-title", { hasText: /^JSON$/ }).click();
    const labels = await bar(page).locator(".menu.open .menu-label").allTextContents();
    expect(labels).toEqual(["Pretty-print (2 spaces)", "Pretty-print (4 spaces)", "Pretty-print (tabs)", "Compress (minify)", "Sort Keys", "Escape as JSON String", "Unescape JSON String", "Validate"]);
  });

  test("Pretty-print (4 spaces) and Compress", async ({ page }) => {
    await paste(page, '{"a":1}');
    await choose(page, "JSON", "json.pretty4");
    await expect(lines(page).nth(1)).toHaveText('    "a": 1');
    await choose(page, "JSON", "json.minify");
    await expect(content(page)).toHaveText('{"a":1}');
  });

  test("Pretty-print (tabs)", async ({ page }) => {
    await paste(page, '{"a":1}');
    await choose(page, "JSON", "json.prettyTabs");
    await expect(lines(page).nth(1)).toHaveText('\t"a": 1');
  });

  test("Sort Keys", async ({ page }) => {
    await paste(page, '{"b":1,"a":2}');
    await choose(page, "JSON", "json.sortKeys");
    await expect(lines(page)).toHaveText(["{", '  "a": 2,', '  "b": 1', "}"]);
  });

  test("Escape then Unescape a selection", async ({ page }) => {
    await paste(page, 'say "hi"');
    await page.keyboard.press("Meta+a");
    await choose(page, "JSON", "json.escape");
    await expect(content(page)).toHaveText('"say \\"hi\\""');
    await page.keyboard.press("Meta+a");
    await choose(page, "JSON", "json.unescape");
    await expect(content(page)).toHaveText('say "hi"');
  });

  test("Pretty-print switches a plain-text tab to JSON", async ({ page }) => {
    await paste(page, '{"a":1}');
    await choose(page, "JSON", "json.pretty");
    await expect(page.getByTestId("statusbar")).toContainText("JSON");
  });
});
