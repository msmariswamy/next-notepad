import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/createEditor";
import { DEFAULT_SETTINGS } from "../settings/model";
import { applyToDocument, applyToView, settingsExtensions } from "./applySettings";

describe("applying settings", () => {
  it("sets theme and font variables on the root element", () => {
    const root = document.createElement("div");
    applyToDocument(root, { ...DEFAULT_SETTINGS, theme: "dark", fontSize: 16 }, false);
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.getPropertyValue("--editor-font-size")).toBe("16px");
  });

  it("follows the OS when theme is 'system'", () => {
    const root = document.createElement("div");
    applyToDocument(root, { ...DEFAULT_SETTINGS, theme: "system" }, true);
    expect(root.dataset.theme).toBe("dark");
  });

  it("toggles word wrap on a live editor", () => {
    const view = createEditor({ parent: document.body, extensions: settingsExtensions(DEFAULT_SETTINGS) });
    expect(view.dom.classList.contains("cm-lineWrapping")).toBe(false);
    applyToView(view, { ...DEFAULT_SETTINGS, wordWrap: true });
    expect(view.contentDOM.classList.contains("cm-lineWrapping")).toBe(true);
    applyToView(view, { ...DEFAULT_SETTINGS, wordWrap: false });
    expect(view.contentDOM.classList.contains("cm-lineWrapping")).toBe(false);
  });

  it("marks spaces and tabs when show-whitespace is on", () => {
    const view = createEditor({
      parent: document.body,
      doc: "a b\tc",
      extensions: settingsExtensions({ ...DEFAULT_SETTINGS, showWhitespace: true }),
    });
    expect(view.contentDOM.querySelectorAll(".cm-ws-space").length).toBe(1);
    expect(view.contentDOM.querySelectorAll(".cm-ws-tab").length).toBe(1);
  });

  it("shows no whitespace marks by default", () => {
    const view = createEditor({ parent: document.body, doc: "a b", extensions: settingsExtensions(DEFAULT_SETTINGS) });
    expect(view.contentDOM.querySelector(".cm-ws-space")).toBeNull();
  });
});
