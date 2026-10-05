import { expect, test } from "@playwright/test";

// A saved session whose tab points at a file that no longer exists, written the way the browser host stores it.
const session = {
  tabs: [{ id: "doc-1", title: "gone.txt", path: "/memory/gone.txt", encoding: "UTF-8", bom: false, eol: "lf", language: "Normal text", languageManual: false, dirty: true, text: "my unsaved words" }],
  activeId: "doc-1",
  recentlyClosed: [],
};

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // Reloading would flush the current (empty) session over the one we seed, so suppress that for this reload.
  await page.evaluate((s) => {
    window.addEventListener("pagehide", (e) => e.stopImmediatePropagation(), { capture: true });
    localStorage.setItem("notepad-next.session", JSON.stringify(s));
  }, session);
  await page.reload();
});

test("a restored tab whose file is gone keeps its text and shows a warning", async ({ page }) => {
  await expect(page.locator(".cm-content")).toHaveText("my unsaved words");
  const tab = page.locator(".tab.missing");
  await expect(tab).toHaveCount(1);
  await expect(tab.locator(".tab-title")).toContainText("⚠");
  await expect(tab.locator(".tab-title")).toHaveAttribute("title", "File not found on disk: /memory/gone.txt");
});

test("the status bar says the file was not found", async ({ page }) => {
  await expect(page.getByTestId("statusbar")).toContainText("File not found on disk");
});

test("saving clears the marker and the status-bar note", async ({ page }) => {
  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+s");
  await expect(page.locator(".tab.missing")).toHaveCount(0);
  await expect(page.getByTestId("statusbar")).not.toContainText("File not found");
});
