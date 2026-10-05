import { describe, expect, it } from "vitest";
import { indentMore } from "@codemirror/commands";
import { tabIndent } from "../edit/indent";
import { EditorSelection } from "@codemirror/state";
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

  describe("show all characters", () => {
    const on = { ...DEFAULT_SETTINGS, showAllCharacters: true };

    it("marks each line end with the document's line ending", () => {
      const view = createEditor({ parent: document.body, doc: "a\nb\nc", extensions: settingsExtensions(on, "crlf") });
      const marks = [...view.contentDOM.querySelectorAll(".cm-eol")].map((m) => m.textContent);
      expect(marks).toEqual(["CRLF", "CRLF"]); // three lines, two line breaks
    });

    it("uses LF and CR labels", () => {
      const lf = createEditor({ parent: document.body, doc: "a\nb", extensions: settingsExtensions(on, "lf") });
      expect(lf.contentDOM.querySelector(".cm-eol")!.textContent).toBe("LF");
      const cr = createEditor({ parent: document.body, doc: "a\nb", extensions: settingsExtensions(on, "cr") });
      expect(cr.contentDOM.querySelector(".cm-eol")!.textContent).toBe("CR");
    });

    it("also marks spaces and tabs", () => {
      const view = createEditor({ parent: document.body, doc: "a b\tc", extensions: settingsExtensions(on) });
      expect(view.contentDOM.querySelectorAll(".cm-ws-space").length).toBe(1);
      expect(view.contentDOM.querySelectorAll(".cm-ws-tab").length).toBe(1);
    });

    it("leaves the document text untouched", () => {
      const view = createEditor({ parent: document.body, doc: "a b\nc", extensions: settingsExtensions(on) });
      expect(view.state.doc.toString()).toBe("a b\nc");
      expect(view.state.sliceDoc(0)).toBe("a b\nc");
    });

    it("shows no line-ending markers when off, and Show Whitespace alone does not add them", () => {
      const off = createEditor({ parent: document.body, doc: "a\nb", extensions: settingsExtensions(DEFAULT_SETTINGS) });
      expect(off.contentDOM.querySelector(".cm-eol")).toBeNull();
      const ws = createEditor({ parent: document.body, doc: "a\nb", extensions: settingsExtensions({ ...DEFAULT_SETTINGS, showWhitespace: true }) });
      expect(ws.contentDOM.querySelector(".cm-eol")).toBeNull();
    });

    it("follows a changed line ending when reconfigured", () => {
      const view = createEditor({ parent: document.body, doc: "a\nb", extensions: settingsExtensions(on, "lf") });
      applyToView(view, on, "crlf");
      expect(view.contentDOM.querySelector(".cm-eol")!.textContent).toBe("CRLF");
    });

    it("has no marker after the last line", () => {
      const view = createEditor({ parent: document.body, doc: "single line", extensions: settingsExtensions(on) });
      expect(view.contentDOM.querySelector(".cm-eol")).toBeNull();
    });
  });

  describe("indentation settings", () => {
    it("indents with the configured number of spaces", () => {
      const view = createEditor({ parent: document.body, doc: "x", extensions: settingsExtensions({ ...DEFAULT_SETTINGS, tabWidth: 2 }) });
      indentMore(view);
      expect(view.state.doc.toString()).toBe("  x");
    });

    it("indents with a tab character when use-tabs is on", () => {
      const view = createEditor({ parent: document.body, doc: "x", extensions: settingsExtensions({ ...DEFAULT_SETTINGS, useTabs: true }) });
      indentMore(view);
      expect(view.state.doc.toString()).toBe("\tx");
    });

    it("Tab on an empty line inserts the indent unit", () => {
      const view = createEditor({ parent: document.body, extensions: settingsExtensions({ ...DEFAULT_SETTINGS, tabWidth: 3 }) });
      tabIndent(view);
      expect(view.state.doc.toString()).toBe("   ");
    });

    it("applies a new tab width to a live editor", () => {
      const view = createEditor({ parent: document.body, doc: "x", extensions: settingsExtensions(DEFAULT_SETTINGS) });
      applyToView(view, { ...DEFAULT_SETTINGS, tabWidth: 8 });
      indentMore(view);
      expect(view.state.doc.toString()).toBe("        x");
    });
  });

  describe("Tab key", () => {
    const mount = (doc: string, over = {}) => createEditor({ parent: document.body, doc, extensions: settingsExtensions({ ...DEFAULT_SETTINGS, ...over }) });

    it("inserts spaces up to the next tab stop at the caret", () => {
      const view = mount("abcd");
      view.dispatch({ selection: { anchor: 2 } });
      tabIndent(view);
      expect(view.state.doc.toString()).toBe("ab  cd");
    });

    it("inserts a tab character when use-tabs is on", () => {
      const view = mount("ab", { useTabs: true });
      view.dispatch({ selection: { anchor: 1 } });
      tabIndent(view);
      expect(view.state.doc.toString()).toBe("a\tb");
    });

    it("indents all selected lines when the selection spans several", () => {
      const view = mount("a\nb", { tabWidth: 2 });
      view.dispatch({ selection: { anchor: 0, head: 3 } });
      tabIndent(view);
      expect(view.state.doc.toString()).toBe("  a\n  b");
    });

    it("types at every caret in a multi-caret selection", () => {
      const view = mount("ab\ncd", { tabWidth: 2 });
      view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(3)]) });
      tabIndent(view);
      expect(view.state.doc.toString()).toBe("  ab\n  cd");
    });
  });
});
