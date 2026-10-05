import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditor } from "./createEditor";
import { JSON_ERROR_MAX_CHARS, jsonErrorMarks, jsonErrorRange } from "./jsonErrors";

const marks = (view: ReturnType<typeof createEditor>) => [...view.contentDOM.querySelectorAll(".cm-json-error")].map((e) => e.textContent);
const mount = (doc: string) => createEditor({ parent: document.body, doc, extensions: [jsonErrorMarks(50)] });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("jsonErrorRange", () => {
  it("is null for valid JSON", () => {
    expect(jsonErrorRange('{"a": 1}')).toBeNull();
  });
  it("marks the character where parsing fails", () => {
    const text = '{"a": 1 "b": 2}';
    expect(jsonErrorRange(text)).toEqual({ from: text.indexOf('"b"'), to: text.indexOf('"b"') + 1 });
  });
  it("marks the last character for an unexpected end of input", () => {
    expect(jsonErrorRange('{"a":')).toEqual({ from: 4, to: 5 });
  });
  it("is null for an empty or blank document", () => {
    expect(jsonErrorRange("")).toBeNull();
    expect(jsonErrorRange("   \n")).toBeNull();
  });
  it("does not run on very large documents", () => {
    expect(jsonErrorRange("[" + "1,".repeat(JSON_ERROR_MAX_CHARS) + "x]")).toBeNull();
  });
});

describe("jsonErrorMarks extension", () => {
  it("underlines the first syntax error after the debounce", async () => {
    const view = mount('{"a": 1 "b": 2}');
    await vi.advanceTimersByTimeAsync(60);
    expect(marks(view)).toEqual(['"']);
  });

  it("shows nothing for valid JSON", async () => {
    const view = mount('{"a": 1}');
    await vi.advanceTimersByTimeAsync(60);
    expect(marks(view)).toEqual([]);
  });

  it("does not mark while the user is still typing, only after the pause", async () => {
    const view = mount('{"a": 1}');
    view.dispatch({ changes: { from: 7, insert: " x" } });
    await vi.advanceTimersByTimeAsync(20);
    expect(marks(view)).toEqual([]);
    await vi.advanceTimersByTimeAsync(60);
    expect(marks(view).length).toBe(1);
  });

  it("removes the mark once the JSON is valid again", async () => {
    const view = mount('{"a": 1 "b": 2}');
    await vi.advanceTimersByTimeAsync(60);
    expect(marks(view).length).toBe(1);
    view.dispatch({ changes: { from: 7, insert: "," } });
    await vi.advanceTimersByTimeAsync(60);
    expect(marks(view)).toEqual([]);
  });

  it("moves with the text while waiting for revalidation", async () => {
    const view = mount('{"a": 1 "b": 2}');
    await vi.advanceTimersByTimeAsync(60);
    view.dispatch({ changes: { from: 0, insert: "  " } });
    expect(marks(view)).toEqual(['"']);
  });

  it("clears stale marks immediately when the whole text is replaced by something valid, after the pause", async () => {
    const view = mount("{oops");
    await vi.advanceTimersByTimeAsync(60);
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "[]" } });
    await vi.advanceTimersByTimeAsync(60);
    expect(marks(view)).toEqual([]);
  });
});
