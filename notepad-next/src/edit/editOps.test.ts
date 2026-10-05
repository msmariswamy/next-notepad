import { beforeEach, describe, expect, it, vi } from "vitest";
import { undo } from "@codemirror/commands";
import { EditorSelection } from "@codemirror/state";
import { App } from "../app/app";
import { memoryClipboard } from "../app/clipboard";
import { DocumentManager } from "../docs/documentManager";
import { createMockIpc } from "../ipc";
import { DEFAULT_SETTINGS } from "../settings/model";
import { BookmarkOps } from "./bookmarkOps";
import { EditOps } from "./editOps";
import { addBookmarks, getBookmarkLines } from "../editor/marks";

let app: App;
let ops: EditOps;
let bm: BookmarkOps;
let clip: ReturnType<typeof memoryClipboard>;
let notify: ReturnType<typeof vi.fn<(m: string, k: "info" | "error") => void>>;
let tabWidth = 4;

beforeEach(() => {
  document.body.innerHTML = '<div id="tabs"></div><div id="editor"></div><div id="status"></div>';
  clip = memoryClipboard();
  notify = vi.fn();
  tabWidth = 4;
  app = new App({
    editorParent: document.getElementById("editor")!,
    tabsEl: document.getElementById("tabs")!,
    statusEl: document.getElementById("status")!,
    manager: new DocumentManager(),
    platform: { pickOpenPath: vi.fn(), pickSavePath: vi.fn(), pickFolder: vi.fn(), confirmUnsaved: vi.fn(), confirm: vi.fn(), clipboard: clip },
    ipc: createMockIpc({}),
    settings: { get: () => ({ ...DEFAULT_SETTINGS, tabWidth }), subscribe: () => () => {} },
    notify,
  });
  app.start();
  ops = new EditOps(app, () => tabWidth);
  bm = new BookmarkOps(app);
});

const set = (text: string, sel?: { from: number; to?: number }) =>
  app.view.dispatch({
    changes: { from: 0, to: app.view.state.doc.length, insert: text },
    selection: sel ? { anchor: sel.from, head: sel.to ?? sel.from } : { anchor: 0 },
  });
const text = () => app.view.state.doc.toString();
const selectAll = () => app.setSelection({ from: 0, to: app.view.state.doc.length });
const caretOnLine = (n: number) => app.setSelection({ from: app.view.state.doc.line(n).from, to: app.view.state.doc.line(n).from });

describe("convert case", () => {
  it("uppercase then lowercase on a selection", () => {
    set("Hello World");
    selectAll();
    ops.convertCase("upper");
    expect(text()).toBe("HELLO WORLD");
    ops.convertCase("lower");
    expect(text()).toBe("hello world");
  });

  it("keeps the converted text selected so conversions can be chained", () => {
    set("hello world");
    selectAll();
    ops.convertCase("upper");
    expect(app.getSelection()).toEqual({ from: 0, to: 11 });
  });

  it("converts the word under the caret when nothing is selected", () => {
    set("hello world", { from: 7 });
    ops.convertCase("upper");
    expect(text()).toBe("hello WORLD");
  });

  it("does nothing when the caret is not on a word", () => {
    set("   ", { from: 1 });
    expect(ops.convertCase("upper")).toBe(false);
  });

  it("proper, sentence and invert case", () => {
    set("hELLO wORLD");
    selectAll();
    ops.convertCase("proper");
    expect(text()).toBe("Hello World");
    set("hello. WORLD is here! ok");
    selectAll();
    ops.convertCase("sentence");
    expect(text()).toBe("Hello. World is here! Ok");
    set("aBc");
    selectAll();
    ops.convertCase("invert");
    expect(text()).toBe("AbC");
  });

  it("works on several selections at once", () => {
    set("ab cd ef");
    app.view.dispatch({ selection: EditorSelection.create([EditorSelection.range(0, 2), EditorSelection.range(6, 8)]) });
    ops.convertCase("upper");
    expect(text()).toBe("AB cd EF");
  });

  it("is one undo step", () => {
    set("hello");
    selectAll();
    ops.convertCase("upper");
    undo(app.view);
    expect(text()).toBe("hello");
  });

  it("marks the tab modified only when the text actually changes", () => {
    set("ABC");
    app.manager.markSaved(app.manager.activeId!);
    selectAll();
    expect(ops.convertCase("upper")).toBe(false);
    expect(app.manager.active!.dirty).toBe(false);
  });
});

describe("line operations", () => {
  it("duplicates the current line", () => {
    set("a\nb\nc");
    caretOnLine(2);
    ops.duplicateLine();
    expect(text()).toBe("a\nb\nb\nc");
  });

  it("removes duplicate lines keeping the first", () => {
    set("a\nb\na\nc\nb");
    ops.removeDuplicateLines();
    expect(text()).toBe("a\nb\nc");
  });

  it("removes consecutive duplicate lines only", () => {
    set("a\na\nb\na");
    ops.removeConsecutiveDuplicateLines();
    expect(text()).toBe("a\nb\na");
  });

  it("limits the operation to the selected lines", () => {
    set("x\nx\nx\nx", { from: 0, to: 3 });
    ops.removeDuplicateLines();
    expect(text()).toBe("x\nx\nx");
  });

  it("does not include a line the selection only touches at its start", () => {
    set("a\na\nb", { from: 0, to: 4 }); // ends at the start of line 3
    ops.removeConsecutiveDuplicateLines();
    expect(text()).toBe("a\nb");
  });

  it("joins the selected lines with a space", () => {
    set("a\nb\nc");
    selectAll();
    ops.joinLines();
    expect(text()).toBe("a b c");
  });

  it("joins the caret's line with the next when nothing is selected", () => {
    set("a\nb\nc");
    caretOnLine(1);
    ops.joinLines();
    expect(text()).toBe("a b\nc");
  });

  it("does nothing joining on the last line", () => {
    set("a\nb");
    caretOnLine(2);
    expect(ops.joinLines()).toBe(false);
  });

  it("splits long lines", () => {
    set("aaa bbb ccc");
    ops.splitLines(7);
    expect(text()).toBe("aaa bbb\nccc");
  });

  it("moves the line down and up, keeping the caret on it", () => {
    set("a\nb\nc");
    caretOnLine(1);
    ops.moveLineDown();
    expect(text()).toBe("b\na\nc");
    expect(app.view.state.doc.lineAt(app.getSelection().from).text).toBe("a");
    ops.moveLineUp();
    expect(text()).toBe("a\nb\nc");
  });

  it("removes empty lines, then lines containing only blanks", () => {
    set("a\n\nb\n  \nc");
    ops.removeEmptyLines();
    expect(text()).toBe("a\nb\n  \nc");
    ops.removeEmptyLinesWithBlanks();
    expect(text()).toBe("a\nb\nc");
  });

  it("inserts a blank line above or below the current line", () => {
    set("a\nb");
    caretOnLine(2);
    ops.insertBlankLine("above");
    expect(text()).toBe("a\n\nb");
    set("a\nb");
    caretOnLine(1);
    ops.insertBlankLine("below");
    expect(text()).toBe("a\n\nb");
  });

  it("reverses line order", () => {
    set("1\n2\n3");
    ops.reverseLines();
    expect(text()).toBe("3\n2\n1");
  });

  it("randomizes without losing lines", () => {
    set("1\n2\n3\n4\n5");
    ops.randomizeLines();
    expect(text().split("\n").sort()).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("a line operation is one undo step", () => {
    set("a\nb\na");
    ops.removeDuplicateLines();
    undo(app.view);
    expect(text()).toBe("a\nb\na");
  });
});

describe("sort lines", () => {
  it("lexicographic ascending then descending", () => {
    set("b\nC\na");
    ops.sort("lex", "asc");
    expect(text()).toBe("C\na\nb");
    ops.sort("lex", "desc");
    expect(text()).toBe("b\na\nC");
  });

  it("ignoring case", () => {
    set("b\nC\na");
    ops.sort("lexIgnoreCase", "asc");
    expect(text()).toBe("a\nb\nC");
  });

  it("integers numerically", () => {
    set("10\n9\n100");
    ops.sort("integer", "asc");
    expect(text()).toBe("9\n10\n100");
  });

  it("decimals with comma and with dot", () => {
    set("1,5\n1,25\n10,0");
    ops.sort("decimalComma", "asc");
    expect(text()).toBe("1,25\n1,5\n10,0");
    set("1.5\n1.25\n10.0");
    ops.sort("decimalDot", "asc");
    expect(text()).toBe("1.25\n1.5\n10.0");
  });

  it("by length, stable", () => {
    set("ccc\na\nbb");
    ops.sort("length", "asc");
    expect(text()).toBe("a\nbb\nccc");
    set("b1\na\nb2");
    ops.sort("length", "asc");
    expect(text()).toBe("a\nb1\nb2");
  });

  it("sorts only the selected lines", () => {
    set("z\nb\na\ny", { from: 2, to: 5 });
    ops.sort("lex", "asc");
    expect(text()).toBe("z\na\nb\ny");
  });
});

describe("blank operations", () => {
  it("trims trailing space", () => {
    set("a  \n b \t");
    ops.trimTrailing();
    expect(text()).toBe("a\n b");
  });

  it("trims leading and trailing space", () => {
    set("  a  \n\tb\t");
    ops.trimBoth();
    expect(text()).toBe("a\nb");
  });

  it("EOL to space", () => {
    set("a\nb\nc");
    ops.eolToSpace();
    expect(text()).toBe("a b c");
  });

  it("only touches the selection when there is one", () => {
    set("a  \nb  ", { from: 0, to: 4 });
    ops.trimTrailing();
    expect(text()).toBe("a\nb  ");
  });

  it("tab to space and space to tab (leading) with tab width 4", () => {
    set("\tx");
    ops.tabToSpace();
    expect(text()).toBe("    x");
    ops.spaceToTabLeading();
    expect(text()).toBe("\tx");
  });

  it("uses the configured tab width", () => {
    tabWidth = 2;
    set("\tx");
    ops.tabToSpace();
    expect(text()).toBe("  x");
  });

  it("space to tab (all)", () => {
    set("ab  cd");
    ops.spaceToTabAll();
    expect(text()).toBe("ab\tcd");
  });
});

describe("indent and comment", () => {
  it("indents and outdents the selected lines", () => {
    set("a\nb");
    selectAll();
    ops.indent();
    expect(text()).toBe("    a\n    b");
    ops.outdent();
    expect(text()).toBe("a\nb");
  });

  it("toggles a line comment in JavaScript", async () => {
    app.setLanguage("JavaScript");
    await app.languageReady();
    set("a\nb");
    selectAll();
    ops.toggleLineComment();
    expect(text()).toBe("// a\n// b");
    ops.toggleLineComment();
    expect(text()).toBe("a\nb");
  });

  it("toggles a block comment in CSS", async () => {
    app.setLanguage("CSS");
    await app.languageReady();
    set("a{}");
    selectAll();
    ops.toggleBlockComment();
    expect(text()).toBe("/* a{} */");
  });

  it("leaves plain text alone", () => {
    set("a");
    selectAll();
    ops.toggleLineComment();
    expect(text()).toBe("a");
  });
});

describe("bookmarked lines", () => {
  const mark = (...lines: number[]) => addBookmarks(app.view, lines.map((n) => app.view.state.doc.line(n).from));

  it("copies bookmarked lines to the clipboard and leaves the document alone", async () => {
    set("a\nb\nc");
    mark(1, 3);
    await bm.copy();
    expect(clip.value).toBe("a\nc");
    expect(text()).toBe("a\nb\nc");
  });

  it("cuts bookmarked lines", async () => {
    set("a\nb\nc");
    mark(1, 3);
    await bm.cut();
    expect(clip.value).toBe("a\nc");
    expect(text()).toBe("b");
  });

  it("removes bookmarked lines", () => {
    set("a\nb\nc");
    mark(2);
    bm.removeBookmarked();
    expect(text()).toBe("a\nc");
  });

  it("removes bookmarked lines at the start, the end and in runs", () => {
    set("a\nb\nc\nd\ne");
    mark(1, 2, 5);
    bm.removeBookmarked();
    expect(text()).toBe("c\nd");
  });

  it("leaves no stray bookmark on a neighbouring line after removing the first line", () => {
    set("a\nb\nc");
    mark(1);
    bm.removeBookmarked();
    expect(getBookmarkLines(app.view.state)).toEqual([]);
  });

  it("removing the only line leaves an empty document", () => {
    set("a");
    mark(1);
    bm.removeBookmarked();
    expect(text()).toBe("");
  });

  it("removes non-bookmarked lines and keeps the bookmarks on what remains", () => {
    set("a\nb\nc");
    mark(2);
    bm.removeNonBookmarked();
    expect(text()).toBe("b");
    expect(getBookmarkLines(app.view.state)).toEqual([1]);
  });

  it("pastes the clipboard over bookmarked lines", async () => {
    set("a\nb\nc");
    mark(2);
    clip.value = "X";
    await bm.pasteReplace();
    expect(text()).toBe("a\nX\nc");
  });

  it("inverts bookmarks", () => {
    set("a\nb\nc");
    mark(2);
    bm.inverse();
    expect(getBookmarkLines(app.view.state)).toEqual([1, 3]);
  });

  it("says so when there are no bookmarks, and changes nothing", async () => {
    set("a\nb");
    expect(bm.removeBookmarked()).toBe(false);
    expect(await bm.copy()).toBe(false);
    expect(notify).toHaveBeenCalledWith("No bookmarked lines", "error");
    expect(text()).toBe("a\nb");
  });

  it("removing bookmarked lines is one undo step", () => {
    set("a\nb\nc");
    mark(1, 3);
    bm.removeBookmarked();
    undo(app.view);
    expect(text()).toBe("a\nb\nc");
  });
});
