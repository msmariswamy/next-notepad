import { beforeEach, describe, expect, it, vi } from "vitest";
import { undo } from "@codemirror/commands";
import { EditorSelection } from "@codemirror/state";
import { App } from "../app/app";
import { memoryClipboard } from "../app/clipboard";
import { DocumentManager } from "../docs/documentManager";
import { createMockIpc } from "../ipc";
import { DEFAULT_SETTINGS } from "../settings/model";
import { DEFAULT_FIND_STATE } from "../search/findController";
import { MacroRecorder } from "./recorder";

let app: App;
let rec: MacroRecorder;

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
  rec = new MacroRecorder(app);
});

const type = (text: string) => {
  const head = app.view.state.selection.main.head;
  app.view.dispatch({ changes: { from: head, insert: text }, selection: { anchor: head + text.length }, userEvent: "input.type" });
};
const setDoc = (t: string, anchor = t.length, head = anchor) =>
  app.view.dispatch({ changes: { from: 0, to: app.view.state.doc.length, insert: t }, selection: EditorSelection.single(anchor, head) });

describe("MacroRecorder text steps", () => {
  it("records nothing until started", () => {
    type("abc");
    expect(rec.recording).toBe(false);
    rec.start();
    expect(rec.stop()).toEqual([]);
  });

  it("merges typed characters into one insert step", () => {
    rec.start();
    for (const c of "abc") type(c);
    expect(rec.stop()).toEqual([{ type: "text", insert: "abc", before: 0, after: 0 }]);
  });

  it("a backspace right after typing removes the last typed character from the step", () => {
    rec.start();
    type("abc");
    app.view.dispatch({ changes: { from: 2, to: 3 }, selection: { anchor: 2 }, userEvent: "delete.backward" });
    expect(rec.stop()).toEqual([{ type: "text", insert: "ab", before: 0, after: 0 }]);
  });

  it("typing then deleting everything records no step", () => {
    rec.start();
    type("a");
    app.view.dispatch({ changes: { from: 0, to: 1 }, selection: { anchor: 0 }, userEvent: "delete.backward" });
    expect(rec.stop()).toEqual([]);
  });

  it("records deleting text before and after the caret relative to it", () => {
    setDoc("hello world", 5);
    rec.start();
    app.view.dispatch({ changes: { from: 4, to: 5 }, selection: { anchor: 4 }, userEvent: "delete.backward" });
    app.view.dispatch({ changes: { from: 4, to: 5 }, userEvent: "delete.forward" });
    expect(rec.stop()).toEqual([
      { type: "text", insert: "", before: 1, after: 0 },
      { type: "text", insert: "", before: 0, after: 1 },
    ]);
  });

  it("merges consecutive backspaces", () => {
    setDoc("hello", 5);
    rec.start();
    app.view.dispatch({ changes: { from: 4, to: 5 }, selection: { anchor: 4 }, userEvent: "delete.backward" });
    app.view.dispatch({ changes: { from: 3, to: 4 }, selection: { anchor: 3 }, userEvent: "delete.backward" });
    expect(rec.stop()).toEqual([{ type: "text", insert: "", before: 2, after: 0 }]);
  });

  it("typing over a selection replaces the selection", () => {
    setDoc("hello world", 0, 5);
    rec.start();
    app.view.dispatch({ changes: { from: 0, to: 5, insert: "J" }, selection: { anchor: 1 }, userEvent: "input.type" });
    expect(rec.stop()).toEqual([{ type: "text", insert: "J", before: 0, after: 0 }]);
  });

  it("deleting a selection records a delete step", () => {
    setDoc("hello world", 0, 6);
    rec.start();
    app.view.dispatch({ changes: { from: 0, to: 6 }, selection: { anchor: 0 }, userEvent: "delete.selection" });
    expect(rec.stop()).toEqual([{ type: "text", insert: "", before: 0, after: 0 }]);
  });

  it("records pasted text as typed text", () => {
    rec.start();
    app.view.dispatch({ changes: { from: 0, insert: "pasted\nlines" }, userEvent: "input.paste" });
    expect(rec.stop()).toEqual([{ type: "text", insert: "pasted\nlines", before: 0, after: 0 }]);
  });

  it("ignores programmatic edits and the undo of typed text (only what was typed is recorded)", () => {
    rec.start();
    app.view.dispatch({ changes: { from: 0, insert: "x" } });
    type("y");
    undo(app.view);
    expect(rec.stop()).toEqual([{ type: "text", insert: "y", before: 0, after: 0 }]);
  });

  it("does not record while paused (playback) and resumes afterwards", () => {
    rec.start();
    rec.pause();
    type("hidden");
    rec.resume();
    type("seen");
    expect(rec.stop()).toEqual([{ type: "text", insert: "seen", before: 0, after: 0 }]);
  });

  it("does not record the edits a recorded command makes", () => {
    rec.start();
    rec.runningCommand(() => app.view.dispatch({ changes: { from: 0, insert: "from command" }, userEvent: "input.type" }));
    expect(rec.stop()).toEqual([]);
  });

  it("a text step that does not touch the selection cannot be replayed relative to it and is skipped", () => {
    setDoc("abcdef", 0);
    rec.start();
    app.view.dispatch({ changes: { from: 4, insert: "X" }, userEvent: "input.type", selection: { anchor: 0 } });
    expect(rec.stop()).toEqual([]);
  });
});

describe("MacroRecorder command steps", () => {
  it("records a command id", () => {
    rec.start();
    rec.recordCommand("line.moveDown");
    expect(rec.stop()).toEqual([{ type: "command", id: "line.moveDown" }]);
  });

  it("keeps typing and commands in order and does not merge typing across a command", () => {
    rec.start();
    type("a");
    rec.recordCommand("sort.lex.asc");
    type("b");
    expect(rec.stop()).toEqual([
      { type: "text", insert: "a", before: 0, after: 0 },
      { type: "command", id: "sort.lex.asc" },
      { type: "text", insert: "b", before: 0, after: 0 },
    ]);
  });

  it("records Find and Replace with their full options", () => {
    rec.start();
    const state = { ...DEFAULT_FIND_STATE, pattern: "a+", replacement: "x", opts: { ...DEFAULT_FIND_STATE.opts, mode: "regex" as const } };
    rec.recordFind("replaceAll", state);
    const [step] = rec.stop();
    expect(step).toMatchObject({ type: "command", id: "find.replaceAll", args: { state: { pattern: "a+", replacement: "x" } } });
    expect((step as unknown as { args: { state: { opts: { mode: string } } } }).args.state.opts.mode).toBe("regex");
  });

  it("copies the Find state so later dialog edits do not change the macro", () => {
    rec.start();
    const state = { ...DEFAULT_FIND_STATE, pattern: "one" };
    rec.recordFind("findNext", state);
    state.pattern = "changed";
    expect((rec.stop()[0] as unknown as { args: { state: { pattern: string } } }).args.state.pattern).toBe("one");
  });

  it("records navigation keys as key.<name> steps, between typing", () => {
    rec.start();
    type("a");
    rec.recordKey("cursorLineDown");
    type("b");
    expect(rec.stop()).toEqual([
      { type: "text", insert: "a", before: 0, after: 0 },
      { type: "command", id: "key.cursorLineDown" },
      { type: "text", insert: "b", before: 0, after: 0 },
    ]);
  });

  it("ignores commands while not recording", () => {
    rec.recordCommand("line.moveDown");
    rec.start();
    expect(rec.stop()).toEqual([]);
  });
});

describe("MacroRecorder lifecycle", () => {
  it("start clears the previous recording", () => {
    rec.start();
    type("a");
    rec.stop();
    rec.start();
    expect(rec.stop()).toEqual([]);
  });

  it("notifies listeners when recording starts and stops", () => {
    const fn = vi.fn();
    rec.subscribe(fn);
    rec.start();
    rec.stop();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("stopping when not recording returns no steps", () => {
    expect(rec.stop()).toEqual([]);
  });
});
