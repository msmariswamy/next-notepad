import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditor } from "./createEditor";
import { languageErrorMarks } from "./syntaxErrors";

type Range = { from: number; to: number } | null;

const marks = (view: ReturnType<typeof createEditor>, cls: string) => [...view.contentDOM.querySelectorAll(`.${cls}`)].map((e) => e.textContent);
const mount = (doc: string, validate: (t: string) => Range | Promise<Range>, cls = "cm-test-error") =>
  createEditor({ parent: document.body, doc, extensions: [languageErrorMarks({ validate, className: cls, delayMs: 50 })] });
const badAtX = (t: string): Range => {
  const i = t.indexOf("x");
  return i < 0 ? null : { from: i, to: i + 1 };
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("languageErrorMarks", () => {
  it("underlines the validator's range after the debounce, not before", async () => {
    const view = mount("ab x cd", badAtX);
    expect(marks(view, "cm-test-error")).toEqual([]);
    await vi.advanceTimersByTimeAsync(60);
    expect(marks(view, "cm-test-error")).toEqual(["x"]);
    view.destroy();
  });

  it("uses the class it was given and marks the text invalid for assistive technology", async () => {
    const view = mount("x", badAtX, "cm-xml-error");
    await vi.advanceTimersByTimeAsync(60);
    const el = view.contentDOM.querySelector(".cm-xml-error")!;
    expect(el.getAttribute("aria-invalid")).toBe("true");
    view.destroy();
  });

  it("shows nothing for valid text", async () => {
    const view = mount("ab cd", badAtX);
    await vi.advanceTimersByTimeAsync(60);
    expect(marks(view, "cm-test-error")).toEqual([]);
    view.destroy();
  });

  it("keeps the mark attached to its text while typing, then re-validates after a pause", async () => {
    const view = mount("ab x cd", badAtX);
    await vi.advanceTimersByTimeAsync(60);
    view.dispatch({ changes: { from: 0, insert: "ZZ" } });
    expect(marks(view, "cm-test-error")).toEqual(["x"]);
    view.dispatch({ changes: { from: view.state.doc.toString().indexOf("x"), to: view.state.doc.toString().indexOf("x") + 1, insert: "ok" } });
    await vi.advanceTimersByTimeAsync(60);
    expect(marks(view, "cm-test-error")).toEqual([]);
    view.destroy();
  });

  it("restarts the debounce on every edit", async () => {
    const validate = vi.fn(badAtX);
    const view = mount("x", validate);
    await vi.advanceTimersByTimeAsync(40);
    view.dispatch({ changes: { from: 0, insert: "a" } });
    await vi.advanceTimersByTimeAsync(40);
    expect(validate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20);
    expect(validate).toHaveBeenCalledTimes(1);
    view.destroy();
  });

  it("supports an async validator", async () => {
    const view = mount("ab x", async (t) => badAtX(t));
    await vi.advanceTimersByTimeAsync(60);
    expect(marks(view, "cm-test-error")).toEqual(["x"]);
    view.destroy();
  });

  it("drops a stale async result when the text changed while it ran", async () => {
    let release: (r: Range) => void = () => {};
    const view = mount("x", () => new Promise<Range>((r) => (release = r)));
    await vi.advanceTimersByTimeAsync(60);
    view.dispatch({ changes: { from: 0, to: 1, insert: "fixed" } });
    release({ from: 0, to: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(marks(view, "cm-test-error")).toEqual([]);
    view.destroy();
  });

  it("does nothing if the view was destroyed while an async validation ran", async () => {
    let release: (r: Range) => void = () => {};
    const view = mount("x", () => new Promise<Range>((r) => (release = r)));
    await vi.advanceTimersByTimeAsync(60);
    view.destroy();
    expect(() => release({ from: 0, to: 1 })).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
  });

  it("ignores a validator that throws", async () => {
    const view = mount("x", () => {
      throw new Error("boom");
    });
    await expect(vi.advanceTimersByTimeAsync(60)).resolves.not.toThrow();
    expect(marks(view, "cm-test-error")).toEqual([]);
    view.destroy();
  });

  it("two extensions with different classes do not interfere", async () => {
    const view = createEditor({
      parent: document.body,
      doc: "x",
      extensions: [languageErrorMarks({ validate: badAtX, className: "cm-a", delayMs: 50 })],
    });
    await vi.advanceTimersByTimeAsync(60);
    expect(marks(view, "cm-a")).toEqual(["x"]);
    expect(marks(view, "cm-b")).toEqual([]);
    view.destroy();
  });
});
