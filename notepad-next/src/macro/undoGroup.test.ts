import { beforeEach, describe, expect, it, vi } from "vitest";
import { redo, undo, undoDepth } from "@codemirror/commands";
import { App } from "../app/app";
import { memoryClipboard } from "../app/clipboard";
import { DocumentManager } from "../docs/documentManager";
import { createMockIpc } from "../ipc";
import { DEFAULT_SETTINGS } from "../settings/model";

let app: App;

beforeEach(() => {
  document.body.innerHTML = '<div id="tabs"></div><div id="editor"></div><div id="status"></div>';
  app = new App({
    editorParent: document.getElementById("editor")!,
    tabsEl: document.getElementById("tabs")!,
    statusEl: document.getElementById("status")!,
    manager: new DocumentManager(),
    platform: { pickOpenPath: vi.fn(), pickSavePath: vi.fn(), pickFolder: vi.fn(), confirmUnsaved: vi.fn(), confirm: vi.fn(), clipboard: memoryClipboard() },
    ipc: createMockIpc({}),
    settings: { get: () => DEFAULT_SETTINGS, subscribe: () => () => {} },
  });
  app.start();
});

const doc = () => app.view.state.doc.toString();
const insertAt = (from: number, text: string) => app.view.dispatch({ changes: { from, insert: text }, userEvent: "input.type" });

describe("undo groups (one undo step for a whole macro playback)", () => {
  it("collapses edits made through applyChangesToDoc, selection moves and typing into one undo step", () => {
    insertAt(0, "line one\nline two\nline three");
    const depthBefore = undoDepth(app.view.state);
    app.beginUndoGroup();
    app.applyChangesToDoc(app.manager.activeId!, [{ from: 0, to: 4, insert: "LINE" }]); // isolateHistory "full" by itself
    app.view.dispatch({ selection: { anchor: 14 } });
    app.view.dispatch({ changes: { from: 14, to: 17, insert: "TWO!" }, selection: { anchor: 18 }, userEvent: "move.line" });
    app.view.dispatch({ selection: { anchor: 0 } });
    insertAt(0, ">> ");
    app.endUndoGroup();
    expect(doc()).toBe(">> LINE one\nline TWO!\nline three");
    expect(undoDepth(app.view.state)).toBe(depthBefore + 1);
    undo(app.view);
    expect(doc()).toBe("line one\nline two\nline three");
  });

  it("redo restores the whole group at once", () => {
    insertAt(0, "abc");
    app.beginUndoGroup();
    insertAt(3, "d");
    app.view.dispatch({ selection: { anchor: 0 } });
    insertAt(0, "x");
    app.endUndoGroup();
    undo(app.view);
    expect(doc()).toBe("abc");
    redo(app.view);
    expect(doc()).toBe("xabcd");
  });

  it("a group does not merge into the typing before it, nor the typing after it into the group", () => {
    insertAt(0, "a");
    app.beginUndoGroup();
    insertAt(1, "b");
    app.endUndoGroup();
    insertAt(2, "c");
    undo(app.view);
    expect(doc()).toBe("ab");
    undo(app.view);
    expect(doc()).toBe("a");
    undo(app.view);
    expect(doc()).toBe("");
  });

  it("the history before the group is left intact and still undoable in order", () => {
    insertAt(0, "one");
    app.view.dispatch({ changes: { from: 3, insert: " two" }, userEvent: "input.paste" });
    app.beginUndoGroup();
    app.view.dispatch({ changes: { from: 0, to: 3, insert: "1" } });
    app.endUndoGroup();
    undo(app.view);
    expect(doc()).toBe("one two");
    undo(app.view);
    expect(doc()).toBe("one");
    undo(app.view);
    expect(doc()).toBe("");
  });

  it("a deletion that removes text an earlier edit created undoes back through both correctly", () => {
    insertAt(0, "abc");
    app.beginUndoGroup();
    app.view.dispatch({ changes: { from: 0, to: 3, insert: "" } });
    app.endUndoGroup();
    expect(doc()).toBe("");
    undo(app.view);
    expect(doc()).toBe("abc");
    undo(app.view);
    expect(doc()).toBe("");
  });

  it("behaves normally again once the group has ended", () => {
    app.beginUndoGroup();
    insertAt(0, "a");
    app.endUndoGroup();
    app.applyChangesToDoc(app.manager.activeId!, [{ from: 1, to: 1, insert: "b" }]);
    app.applyChangesToDoc(app.manager.activeId!, [{ from: 2, to: 2, insert: "c" }]);
    undo(app.view);
    expect(doc()).toBe("ab");
  });

  it("two groups in a row stay two undo steps", () => {
    insertAt(0, "abc");
    app.beginUndoGroup();
    insertAt(3, "1");
    app.view.dispatch({ selection: { anchor: 0 } });
    insertAt(0, "A");
    app.endUndoGroup();
    app.beginUndoGroup();
    insertAt(0, "B");
    app.view.dispatch({ selection: { anchor: 6 } });
    insertAt(6, "2");
    app.endUndoGroup();
    expect(doc()).toBe("BAabc12");
    undo(app.view);
    expect(doc()).toBe("Aabc1");
    undo(app.view);
    expect(doc()).toBe("abc");
  });

  it("an empty group leaves no history entry", () => {
    insertAt(0, "a");
    const depth = undoDepth(app.view.state);
    app.beginUndoGroup();
    app.view.dispatch({ selection: { anchor: 0 } });
    app.endUndoGroup();
    expect(undoDepth(app.view.state)).toBe(depth);
  });

  it("an undo issued inside a group still acts as a normal undo", () => {
    insertAt(0, "a");
    app.beginUndoGroup();
    insertAt(1, "b");
    undo(app.view);
    app.endUndoGroup();
    expect(doc()).toBe("a");
  });
});
