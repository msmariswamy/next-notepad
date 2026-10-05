import { expect, test, type Page } from "@playwright/test";

const bar = (page: Page) => page.getByTestId("menubar");
const content = (page: Page) => page.locator("#editor .cm-content");

async function menu(page: Page, title: string, id: string) {
  await bar(page).locator(".menu-title", { hasText: new RegExp(`^${title}$`) }).click();
  await bar(page).locator(`[data-command="${id}"]`).click();
}

async function setLanguageAndType(page: Page, language: string | null, text: string) {
  if (language) await menu(page, "Language", `lang.${language}`);
  await content(page).click();
  await page.keyboard.insertText(text);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("JSON to YAML opens a new YAML tab and leaves the JSON tab unchanged", async ({ page }) => {
  await setLanguageAndType(page, "JSON", '{"name": "x", "list": [1, 2]}');
  await menu(page, "JSON", "convert.jsonToYaml");
  await expect(page.locator(".tab")).toHaveCount(2);
  await expect(page.locator("#editor .cm-line")).toHaveText(["name: x", "list:", "  - 1", "  - 2"]);
  await expect(page.getByTestId("statusbar")).toContainText("YAML");
  await page.locator(".tab").first().click();
  await expect(content(page)).toHaveText('{"name": "x", "list": [1, 2]}');
});

test("YAML to JSON drops comments with a notice", async ({ page }) => {
  await setLanguageAndType(page, "YAML", "# note\na: 1\nb: [x, y]");
  await menu(page, "YAML", "convert.yamlToJson");
  await expect(page.locator(".tab")).toHaveCount(2);
  await expect(page.getByTestId("toast")).toContainText("comments were dropped");
  await expect(content(page)).toContainText('"a": 1');
  await expect(page.getByTestId("statusbar")).toContainText("JSON");
});

test("XML to JSON uses @attr and #text", async ({ page }) => {
  await setLanguageAndType(page, "XML", '<p lang="en">hello</p>');
  await menu(page, "XML", "convert.xmlToJson");
  await expect(content(page)).toContainText('"@lang": "en"');
  await expect(content(page)).toContainText('"#text": "hello"');
});

test("JSON to XML builds the element tree", async ({ page }) => {
  await setLanguageAndType(page, "JSON", '{"book": {"@id": "1", "title": "A"}}');
  await menu(page, "JSON", "convert.jsonToXml");
  await expect(page.locator("#editor .cm-line")).toHaveText(['<book id="1">', "  <title>A</title>", "</book>"]);
  await expect(page.getByTestId("statusbar")).toContainText("XML");
});

test("an invalid source opens no tab and reports the position", async ({ page }) => {
  await setLanguageAndType(page, "JSON", '{"a": }');
  await menu(page, "JSON", "convert.jsonToYaml");
  await expect(page.locator(".tab")).toHaveCount(1);
  await expect(page.getByTestId("toast")).toContainText(/Cannot convert JSON: Line 1/);
});

test("a dropped-comments notice for XML", async ({ page }) => {
  await setLanguageAndType(page, "XML", "<a><!-- x --><b/></a>");
  await menu(page, "XML", "convert.xmlToJson");
  await expect(page.getByTestId("toast")).toContainText("comments were dropped");
});

test("a Convert command is not recorded in a macro", async ({ page }) => {
  await setLanguageAndType(page, "JSON", '{"a": 1}');
  await menu(page, "Macro", "macro.startRecording");
  await menu(page, "JSON", "convert.jsonToYaml");
  await expect(page.getByTestId("toast")).toContainText(/cannot be recorded/i);
});
