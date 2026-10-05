import { expect, test, type Page } from "@playwright/test";

const bar = (page: Page) => page.getByTestId("menubar");
const content = (page: Page) => page.locator("#editor .cm-content");

async function menu(page: Page, title: string, id: string) {
  await bar(page).locator(".menu-title", { hasText: new RegExp(`^${title}$`) }).click();
  await bar(page).locator(`[data-command="${id}"]`).click();
}
const macro = (page: Page, id: string) => menu(page, "Macro", id);

/** Record "* " + move to the start of the next line on a three-line document, leaving the caret on line 2. */
async function recordBullet(page: Page) {
  await content(page).click();
  await page.keyboard.insertText("one\ntwo\nthree");
  await page.keyboard.press("Meta+ArrowUp");
  await macro(page, "macro.startRecording");
  await page.keyboard.type("* ");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Home");
  await macro(page, "macro.stopRecording");
}

test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => void d.dismiss());
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("record typing and movement, then play it back on the next lines", async ({ page }) => {
  await recordBullet(page);
  await expect(page.getByTestId("toast")).toContainText(/Recorded macro \(\d+ steps?\)/);
  await expect(content(page)).toHaveText("* one" + "two" + "three");
  await macro(page, "macro.playback");
  await macro(page, "macro.playback");
  await expect(page.locator("#editor .cm-line")).toHaveText(["* one", "* two", "* three"]);
});

test("a whole playback is one undo step", async ({ page }) => {
  await recordBullet(page);
  await macro(page, "macro.playback");
  await page.waitForTimeout(600);
  await macro(page, "macro.playback");
  await page.keyboard.press("Meta+z");
  await expect(page.locator("#editor .cm-line")).toHaveText(["* one", "* two", "three"]);
});

test("run a macro multiple times from the dialog", async ({ page }) => {
  await recordBullet(page);
  await macro(page, "macro.runMultiple");
  await page.getByTestId("macro-run-count").fill("2");
  await page.getByTestId("macro-run-dialog-ok").click();
  await expect(page.locator("#editor .cm-line")).toHaveText(["* one", "* two", "* three"]);
});

test("run until the end of the file stops without an error", async ({ page }) => {
  await recordBullet(page);
  await macro(page, "macro.runMultiple");
  await page.getByTestId("macro-run-eof-radio").check();
  await page.getByTestId("macro-run-dialog-ok").click();
  await expect(page.locator("#editor .cm-line")).toHaveText(["* one", "* two", "* three"]);
  await expect(page.locator(".toast.error")).toHaveCount(0);
});

test("commands that open dialogs are not recorded and a toast says so", async ({ page }) => {
  await content(page).click();
  await macro(page, "macro.startRecording");
  await menu(page, "File", "file.open");
  await expect(page.getByTestId("toast")).toContainText(/cannot be recorded/i);
  await page.keyboard.type("x");
  await macro(page, "macro.stopRecording");
  await expect(page.getByTestId("toast")).toContainText(/Recorded macro \(1 step\)/);
});

test("playback is refused while recording", async ({ page }) => {
  await content(page).click();
  await macro(page, "macro.startRecording");
  await page.keyboard.type("x");
  await macro(page, "macro.playback");
  await expect(page.getByTestId("toast")).toContainText(/stop recording/i);
});

test("saving names a macro, lists it in the menu, and it survives a restart", async ({ page }) => {
  await recordBullet(page);
  await macro(page, "macro.saveAs");
  await page.getByTestId("macro-name-input").fill("bullets");
  await page.getByTestId("macro-name-dialog-ok").click();
  await expect(page.getByTestId("toast")).toContainText('Saved macro "bullets"');

  await page.reload();
  await bar(page).locator(".menu-title", { hasText: /^Macro$/ }).click();
  await expect(bar(page).locator('[data-command="macro.run.0"]')).toContainText("bullets");
  await bar(page).locator('[data-command="macro.run.0"]').click();
  await expect(page.locator("#editor .cm-line").nth(1)).toHaveText("* two");
});

test("rename and delete saved macros in the manager", async ({ page }) => {
  await recordBullet(page);
  await macro(page, "macro.saveAs");
  await page.getByTestId("macro-name-input").fill("bullets");
  await page.getByTestId("macro-name-dialog-ok").click();

  await macro(page, "macro.manage");
  await expect(page.getByTestId("macro-item")).toHaveCount(1);
  await page.getByTestId("macro-rename").click();
  await page.getByTestId("macro-name-input").fill("renamed");
  await page.getByTestId("macro-name-dialog-ok").click();
  await expect(page.getByTestId("macro-item")).toContainText("renamed");

  await page.getByTestId("macro-delete").click();
  await page.getByTestId("confirm-dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("macro-manager-empty")).toBeVisible();
});

test("with nothing recorded, Playback says so", async ({ page }) => {
  await macro(page, "macro.playback");
  await expect(page.getByTestId("toast")).toContainText(/no macro to play/i);
});
