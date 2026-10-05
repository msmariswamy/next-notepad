import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { undo } from "@codemirror/commands";
import { App } from "../app/app";
import { memoryClipboard } from "../app/clipboard";
import { DocumentManager } from "../docs/documentManager";
import { createMockIpc } from "../ipc";
import { DEFAULT_SETTINGS, type Settings } from "../settings/model";
import { SplitView } from "./splitView";

let app: App;
let panes: HTMLElement;
let second: HTMLElement;
let split: SplitView;
let settings: Settings;

const setText = (t: string) => app.view.dispatch({ changes: { from: 0, to: app.view.state.doc.length, insert: t }, selection: { anchor: 0 } });
const secondText = () => split.secondary!.state.doc.toString();

beforeEach(() => {
  document.body.innerHTML = '<div id="tabs"></div><div id="panes"><div id="editor"></div><div id="editor2" hidden></div></div><div id="status"></div>';
  settings = { ...DEFAULT_SETTINGS };
  app = new App({
    editorParent: document.getElementById("editor")!,
    tabsEl: document.getElementById("tabs")!,
    statusEl: document.getElementById("status")!,
    manager: new DocumentManager(),
    platform: { pickOpenPath: vi.fn(), pickSavePath: vi.fn(), pickFolder: vi.fn(), confirmUnsaved: vi.fn(), confirm: vi.fn(), clipboard: memoryClipboard() },
    ipc: createMockIpc({}),
    settings: { get: () => settings, subscribe: () => () => {} },
  });
  app.start();
  panes = document.getElementById("panes")!;
  second = document.getElementById("editor2")!;
  split = new SplitView({ app, panes, secondParent: second, settings: { get: () => settings, subscribe: () => () => {} } });
});

afterEach(() => split.dispose());

describe("SplitView", () => {
  it("opens a vertical split showing the same document in a second pane", () => {
    setText("hello");
    split.open("vertical");
    expect(split.isOpen).toBe(true);
    expect(second.hidden).toBe(false);
    expect(panes.dataset.split).toBe("vertical");
    expect(secondText()).toBe("hello");
  });

  it("opens a horizontal split and can switch orientation while open", () => {
    split.open("horizontal");
    expect(panes.dataset.split).toBe("horizontal");
    split.open("vertical");
    expect(panes.dataset.split).toBe("vertical");
    expect(document.querySelectorAll("#editor2 .cm-editor")).toHaveLength(1);
  });

  it("closes the split and leaves the document unchanged", () => {
    setText("keep me");
    split.open("vertical");
    split.close();
    expect(split.isOpen).toBe(false);
    expect(second.hidden).toBe(true);
    expect(panes.dataset.split).toBeUndefined();
    expect(app.view.state.doc.toString()).toBe("keep me");
  });

  it("an edit in the second pane appears in the first and marks the tab modified once", () => {
    split.open("vertical");
    const dirtyBefore = app.manager.active!.dirty;
    split.secondary!.dispatch({ changes: { from: 0, insert: "typed" }, userEvent: "input.type" });
    expect(app.view.state.doc.toString()).toBe("typed");
    expect(app.manager.active!.text).toBe("typed");
    expect(dirtyBefore).toBe(false);
    expect(app.manager.active!.dirty).toBe(true);
  });

  it("an edit in the first pane appears in the second", () => {
    split.open("vertical");
    setText("from primary");
    expect(secondText()).toBe("from primary");
  });

  it("edits made through the app (for example Replace All) reach both panes", () => {
    setText("a b a");
    split.open("vertical");
    app.applyChangesToDoc(app.manager.activeId!, [
      { from: 0, to: 1, insert: "X" },
      { from: 4, to: 5, insert: "X" },
    ]);
    expect(secondText()).toBe("X b X");
  });

  it("undo from the first pane reverts both", () => {
    split.open("vertical");
    split.secondary!.dispatch({ changes: { from: 0, insert: "x" }, userEvent: "input.type" });
    undo(app.view);
    expect(app.view.state.doc.toString()).toBe("");
    expect(secondText()).toBe("");
  });

  it("the second pane's undo key acts on the shared history", () => {
    split.open("vertical");
    app.view.dispatch({ changes: { from: 0, insert: "x" }, userEvent: "input.type" });
    split.undoFromClone();
    expect(app.view.state.doc.toString()).toBe("");
    expect(secondText()).toBe("");
    split.redoFromClone();
    expect(secondText()).toBe("x");
  });

  it("each pane keeps its own caret", () => {
    setText("one\ntwo");
    split.open("vertical");
    split.secondary!.dispatch({ selection: { anchor: 6 } });
    app.view.dispatch({ selection: { anchor: 1 } });
    expect(split.secondary!.state.selection.main.head).toBe(6);
    expect(app.view.state.selection.main.head).toBe(1);
  });

  it("Move to Other Pane moves focus between the panes", () => {
    split.open("vertical");
    const focusSecondary = vi.spyOn(split.secondary!, "focus");
    const focusPrimary = vi.spyOn(app.view, "focus");
    split.moveToOtherPane();
    expect(focusSecondary).toHaveBeenCalled();
    vi.spyOn(split.secondary!, "hasFocus", "get").mockReturnValue(true);
    split.moveToOtherPane();
    expect(focusPrimary).toHaveBeenCalled();
  });

  it("does nothing for Move to Other Pane when there is no split", () => {
    expect(() => split.moveToOtherPane()).not.toThrow();
  });

  it("closes the split when the user switches tabs", () => {
    const firstId = app.manager.activeId!;
    split.open("vertical");
    app.newTab();
    expect(split.isOpen).toBe(false);
    expect(app.manager.activeId).not.toBe(firstId);
  });

  it("closes the split when its tab is closed", async () => {
    app.newTab();
    split.open("vertical");
    await app.closeTab(app.manager.activeId!);
    expect(split.isOpen).toBe(false);
  });

  it("a language change follows into the second pane", async () => {
    setText("function a(){}");
    split.open("vertical");
    app.setLanguage("JavaScript");
    await app.languageReady();
    await new Promise((r) => setTimeout(r, 20));
    expect(split.secondary!.dom.querySelector(".cm-content")).not.toBeNull();
    expect(split.appliedLanguage).toBe("JavaScript");
  });
});
