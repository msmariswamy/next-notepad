import { describe, expect, it } from "vitest";
import { createEditor } from "./createEditor";
import {
  MARK_STYLES,
  addBookmarks,
  addMarks,
  clearBookmarks,
  clearMarks,
  getBookmarkLines,
  getMarks,
  marksExtension,
  neighbourBookmark,
  toggleBookmark,
} from "./marks";

const mount = (doc: string) => createEditor({ parent: document.body, doc, extensions: marksExtension() });

describe("marks", () => {
  it("offers five styles", () => {
    expect(MARK_STYLES).toBe(5);
  });

  it("highlights every marked range", () => {
    const v = mount("ab ab");
    addMarks(v, 1, [{ from: 0, to: 2 }, { from: 3, to: 5 }]);
    expect(getMarks(v.state)).toEqual([
      { style: 1, from: 0, to: 2 },
      { style: 1, from: 3, to: 5 },
    ]);
    expect(v.contentDOM.querySelectorAll(".cm-mark-1").length).toBe(2);
  });

  it("keeps different styles side by side", () => {
    const v = mount("foo bar");
    addMarks(v, 1, [{ from: 0, to: 3 }]);
    addMarks(v, 2, [{ from: 4, to: 7 }]);
    expect(getMarks(v.state).map((m) => m.style)).toEqual([1, 2]);
    expect(v.contentDOM.querySelector(".cm-mark-2")!.textContent).toBe("bar");
  });

  it("purges earlier marks of the same style when asked", () => {
    const v = mount("foo bar");
    addMarks(v, 1, [{ from: 0, to: 3 }]);
    addMarks(v, 1, [{ from: 4, to: 7 }], true);
    expect(getMarks(v.state)).toEqual([{ style: 1, from: 4, to: 7 }]);
  });

  it("purging one style leaves the others", () => {
    const v = mount("foo bar");
    addMarks(v, 1, [{ from: 0, to: 3 }]);
    addMarks(v, 2, [{ from: 4, to: 7 }], true);
    expect(getMarks(v.state).map((m) => m.style)).toEqual([1, 2]);
  });

  it("clears one style or all of them", () => {
    const v = mount("foo bar");
    addMarks(v, 1, [{ from: 0, to: 3 }]);
    addMarks(v, 2, [{ from: 4, to: 7 }]);
    clearMarks(v, 1);
    expect(getMarks(v.state).map((m) => m.style)).toEqual([2]);
    clearMarks(v);
    expect(getMarks(v.state)).toEqual([]);
  });

  it("ignores empty ranges", () => {
    const v = mount("abc");
    addMarks(v, 1, [{ from: 1, to: 1 }]);
    expect(getMarks(v.state)).toEqual([]);
  });

  it("keeps a mark attached to its text when lines are inserted above", () => {
    const v = mount("a\nword");
    addMarks(v, 3, [{ from: 2, to: 6 }]);
    v.dispatch({ changes: { from: 0, insert: "new line\n" } });
    expect(getMarks(v.state)).toEqual([{ style: 3, from: 11, to: 15 }]);
  });
});

describe("bookmarks", () => {
  it("toggles a bookmark on a line", () => {
    const v = mount("a\nb\nc");
    toggleBookmark(v, 2);
    expect(getBookmarkLines(v.state)).toEqual([2]);
    toggleBookmark(v, 3); // another position on the same line toggles it off
    expect(getBookmarkLines(v.state)).toEqual([]);
  });

  it("adds a bookmark per distinct line, without duplicates", () => {
    const v = mount("a\nb\nc");
    addBookmarks(v, [0, 1, 4]);
    addBookmarks(v, [0]);
    expect(getBookmarkLines(v.state)).toEqual([1, 3]);
  });

  it("follows its line when text is inserted above", () => {
    const v = mount("a\nb");
    toggleBookmark(v, 2);
    v.dispatch({ changes: { from: 0, insert: "x\n" } });
    expect(getBookmarkLines(v.state)).toEqual([3]);
  });

  it("clears all bookmarks", () => {
    const v = mount("a\nb");
    addBookmarks(v, [0, 2]);
    clearBookmarks(v);
    expect(getBookmarkLines(v.state)).toEqual([]);
  });

  it("navigates to the next and previous bookmark with wrap-around", () => {
    const v = mount("a\nb\nc\nd");
    addBookmarks(v, [0, 4, 6]); // lines 1, 3, 4
    expect(v.state.doc.lineAt(neighbourBookmark(v.state, 0, false)!).number).toBe(3);
    expect(v.state.doc.lineAt(neighbourBookmark(v.state, 6, false)!).number).toBe(1);
    expect(v.state.doc.lineAt(neighbourBookmark(v.state, 4, true)!).number).toBe(1);
    expect(v.state.doc.lineAt(neighbourBookmark(v.state, 0, true)!).number).toBe(4);
  });

  it("returns null when there are no bookmarks", () => {
    expect(neighbourBookmark(mount("a").state, 0, false)).toBeNull();
  });

  it("renders a gutter marker for a bookmarked line", () => {
    const v = mount("a\nb");
    toggleBookmark(v, 0);
    expect(v.dom.querySelector(".cm-bookmark")).not.toBeNull();
  });
});
