import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../app/app";
import { createMockIpc } from "../ipc";
import { DocumentManager } from "../docs/documentManager";
import { DEFAULT_SETTINGS } from "../settings/model";
import { FindController } from "./findController";
import { getBookmarkLines, getMarks } from "../editor/marks";

let app: App;
let find: FindController;

beforeEach(() => {
  document.body.innerHTML = '<div id="tabs"></div><div id="editor"></div><div id="status"></div>';
  app = new App({
    editorParent: document.getElementById("editor")!,
    tabsEl: document.getElementById("tabs")!,
    statusEl: document.getElementById("status")!,
    manager: new DocumentManager(),
    platform: { pickOpenPath: vi.fn(), pickSavePath: vi.fn(), confirmUnsaved: vi.fn() },
    ipc: createMockIpc({}),
    settings: { get: () => DEFAULT_SETTINGS, subscribe: () => () => {} },
  });
  app.start();
  find = new FindController(app);
});

const setText = (text: string) =>
  app.view.dispatch({ changes: { from: 0, to: app.view.state.doc.length, insert: text }, selection: { anchor: 0 } });
const text = () => app.view.state.doc.toString();
const selected = () => {
  const { from, to } = app.getSelection();
  return text().slice(from, to);
};

describe("Find Next", () => {
  it("selects successive matches", () => {
    setText("a b a");
    find.state.pattern = "a";
    expect(find.findNext()).toBe(true);
    expect(app.getSelection()).toEqual({ from: 0, to: 1 });
    expect(find.findNext()).toBe(true);
    expect(app.getSelection()).toEqual({ from: 4, to: 5 });
    expect(find.findNext()).toBe(false);
  });

  it("wraps around when enabled", () => {
    setText("a b a");
    find.state.pattern = "a";
    find.state.wrap = true;
    find.findNext();
    find.findNext();
    expect(find.findNext()).toBe(true);
    expect(app.getSelection().from).toBe(0);
  });

  it("searches backward from the caret", () => {
    setText("a b a");
    app.setSelection({ from: 5, to: 5 });
    find.state.pattern = "a";
    find.state.backward = true;
    find.findNext();
    expect(app.getSelection()).toEqual({ from: 4, to: 5 });
  });

  it("throws a SyntaxError for an invalid regex and leaves the document alone", () => {
    setText("abc");
    find.state.pattern = "(unclosed";
    find.state.opts.mode = "regex";
    expect(() => find.findNext()).toThrow(SyntaxError);
    expect(text()).toBe("abc");
  });
});

describe("Count and Find All", () => {
  it("counts matches", () => {
    setText("ab ab ab");
    find.state.pattern = "ab";
    expect(find.count()).toBe(3);
  });

  it("lists hits with line numbers and line text for the current document", () => {
    setText("one\ntwo todo\nthree");
    find.state.pattern = "todo";
    const out = find.findAllInCurrent();
    expect(out.summary).toBe('Search "todo" (1 hit in 1 file)');
    expect(out.results[0].hits[0]).toMatchObject({ line: 2, text: "two todo" });
  });

  it("groups hits by document across all opened documents", () => {
    setText("todo a");
    app.newTab();
    setText("nothing");
    app.newTab();
    setText("todo b\ntodo c");
    find.state.pattern = "todo";
    const out = find.findAllInOpened();
    expect(out.results.map((r) => [r.title, r.hits.length])).toEqual([
      ["new 1", 1],
      ["new 3", 2],
    ]);
    expect(out.summary).toBe('Search "todo" (3 hits in 2 files)');
  });

  it("restricts the count to the selection when In selection is on", () => {
    setText("x x x");
    app.setSelection({ from: 0, to: 3 });
    find.state.pattern = "x";
    find.state.inSelection = true;
    expect(find.count()).toBe(2);
  });

  it("ignores In selection when nothing is selected", () => {
    setText("x x x");
    find.state.pattern = "x";
    find.state.inSelection = true;
    expect(find.count()).toBe(3);
  });
});

describe("Replace", () => {
  it("replaces the selected match and moves to the next one", () => {
    setText("x y x");
    find.state.pattern = "x";
    find.state.replacement = "zz";
    find.findNext(); // selects first x
    expect(find.replace()).toBe(true);
    expect(text()).toBe("zz y x");
    expect(selected()).toBe("x");
  });

  it("just finds the next match when the selection is not a match", () => {
    setText("x y x");
    find.state.pattern = "x";
    find.state.replacement = "z";
    find.replace();
    expect(text()).toBe("x y x");
    expect(selected()).toBe("x");
  });

  it("Replace All changes every match", () => {
    setText("x y x");
    find.state.pattern = "x";
    find.state.replacement = "z";
    expect(find.replaceAll()).toBe(2);
    expect(text()).toBe("z y z");
  });

  it("Replace All is a single undo step", async () => {
    const { undo } = await import("@codemirror/commands");
    setText("x x x");
    find.state.pattern = "x";
    find.state.replacement = "y";
    find.replaceAll();
    undo(app.view);
    expect(text()).toBe("x x x");
  });

  it("Replace All with capture groups in regex mode", () => {
    setText("hello world");
    find.state.pattern = "(\\w+) (\\w+)";
    find.state.replacement = "\\2 \\1";
    find.state.opts.mode = "regex";
    find.replaceAll();
    expect(text()).toBe("world hello");
  });

  it("Replace All in selection only touches the selection", () => {
    setText("x\nx");
    app.setSelection({ from: 0, to: 1 });
    find.state.pattern = "x";
    find.state.replacement = "y";
    find.state.inSelection = true;
    find.replaceAll();
    expect(text()).toBe("y\nx");
  });

  it("Replace All in All Opened Documents updates every tab and marks them modified", () => {
    setText("foo one");
    app.newTab();
    setText("foo two");
    find.state.pattern = "foo";
    find.state.replacement = "bar";
    expect(find.replaceAllInOpened()).toEqual({ replacements: 2, files: 2 });
    expect(app.manager.docs.map((d) => d.text)).toEqual(["bar one", "bar two"]);
    expect(app.manager.docs.every((d) => d.dirty)).toBe(true);
  });
});

describe("Mark", () => {
  it("marks every match in the chosen style", () => {
    setText("ab ab");
    find.state.pattern = "ab";
    expect(find.markAll({ style: 2, bookmarkLine: false, purge: false })).toBe(2);
    expect(getMarks(app.view.state)).toEqual([
      { style: 2, from: 0, to: 2 },
      { style: 2, from: 3, to: 5 },
    ]);
  });

  it("bookmarks the lines that contain matches", () => {
    setText("error one\nfine\nerror two");
    find.state.pattern = "error";
    find.markAll({ style: 1, bookmarkLine: true, purge: false });
    expect(getBookmarkLines(app.view.state)).toEqual([1, 3]);
  });

  it("purges the previous marks of the same style when asked", () => {
    setText("foo bar");
    find.state.pattern = "foo";
    find.markAll({ style: 1, bookmarkLine: false, purge: false });
    find.state.pattern = "bar";
    find.markAll({ style: 1, bookmarkLine: false, purge: true });
    expect(getMarks(app.view.state).map((m) => [m.from, m.to])).toEqual([[4, 7]]);
  });

  it("marks only the selection when In selection is on", () => {
    setText("x x x");
    app.setSelection({ from: 0, to: 3 });
    find.state.pattern = "x";
    find.state.inSelection = true;
    expect(find.markAll({ style: 1, bookmarkLine: false, purge: false })).toBe(2);
  });

  it("clears marks and bookmarks", () => {
    setText("a\na");
    find.state.pattern = "a";
    find.markAll({ style: 1, bookmarkLine: true, purge: false });
    find.clearMarks();
    find.clearBookmarks();
    expect(getMarks(app.view.state)).toEqual([]);
    expect(getBookmarkLines(app.view.state)).toEqual([]);
  });

  it("keeps marks per tab", () => {
    setText("foo");
    find.state.pattern = "foo";
    find.markAll({ style: 1, bookmarkLine: false, purge: false });
    app.newTab();
    expect(getMarks(app.view.state)).toEqual([]);
    app.activateTab(app.manager.docs[0].id);
    expect(getMarks(app.view.state).length).toBe(1);
  });

  it("navigates bookmarks with wrap-around", () => {
    setText("a\nb\nc");
    find.state.pattern = "[ac]";
    find.state.opts.mode = "regex";
    find.markAll({ style: 1, bookmarkLine: true, purge: false });
    app.setSelection({ from: 0, to: 0 });
    expect(find.gotoBookmark(false)).toBe(true);
    expect(app.getSelection().from).toBe(4);
    find.gotoBookmark(false);
    expect(app.getSelection().from).toBe(0);
  });
});
