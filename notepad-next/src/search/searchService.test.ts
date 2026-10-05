import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { DEFAULT_PATTERN_OPTIONS, type PatternOptions } from "./regexCompat";
import { countMatches, findAll, findNext, planReplaceAll, planReplaceCurrent, type Query } from "./searchService";

const q = (pattern: string, over: Partial<PatternOptions> = {}, replacement = ""): Query => ({
  pattern,
  replacement,
  opts: { ...DEFAULT_PATTERN_OPTIONS, ...over },
});
const sel = (from: number, to = from) => ({ from, to });
const apply = (text: string, changes: { from: number; to: number; insert: string }[]) =>
  EditorState.create({ doc: text }).update({ changes }).state.doc.toString();

describe("findAll / count", () => {
  it("lists every match with positions", () => {
    expect(findAll("ab ab ab", q("ab"))).toEqual([
      { from: 0, to: 2 },
      { from: 3, to: 5 },
      { from: 6, to: 8 },
    ]);
  });

  it("counts matches", () => {
    expect(countMatches("ab ab ab", q("ab"))).toBe(3);
    expect(countMatches("Foo foo", q("foo"))).toBe(2);
  });

  it("returns nothing for an empty pattern", () => {
    expect(findAll("abc", q(""))).toEqual([]);
  });

  it("supports zero-length regex matches such as ^ and advances past them", () => {
    expect(findAll("a\nb\nc", q("^", { mode: "regex" })).map((m) => m.from)).toEqual([0, 2, 4]);
  });

  it("restricts matches to a range (in selection)", () => {
    expect(findAll("ab ab ab", q("ab"), sel(3, 8))).toEqual([
      { from: 3, to: 5 },
      { from: 6, to: 8 },
    ]);
  });

  it("excludes a match that crosses the range boundary", () => {
    expect(findAll("abab", q("ab"), sel(1, 4))).toEqual([{ from: 2, to: 4 }]);
  });
});

describe("findNext", () => {
  const text = "a b a";

  it("finds the next match at or after the caret", () => {
    expect(findNext(text, q("a"), sel(0), { backward: false, wrap: false })).toEqual({ from: 0, to: 1 });
  });

  it("continues after the current selection", () => {
    expect(findNext(text, q("a"), sel(0, 1), { backward: false, wrap: false })).toEqual({ from: 4, to: 5 });
  });

  it("returns null past the last match when wrap is off", () => {
    expect(findNext(text, q("a"), sel(4, 5), { backward: false, wrap: false })).toBeNull();
  });

  it("wraps to the first match when wrap is on", () => {
    expect(findNext(text, q("a"), sel(4, 5), { backward: false, wrap: true })).toEqual({ from: 0, to: 1 });
  });

  it("searches backward from the selection start", () => {
    expect(findNext(text, q("a"), sel(4, 5), { backward: true, wrap: false })).toEqual({ from: 0, to: 1 });
  });

  it("wraps backward to the last match", () => {
    expect(findNext(text, q("a"), sel(0), { backward: true, wrap: true })).toEqual({ from: 4, to: 5 });
  });

  it("returns null backward from the start when wrap is off", () => {
    expect(findNext(text, q("a"), sel(0), { backward: true, wrap: false })).toBeNull();
  });

  it("returns null when there is no match at all", () => {
    expect(findNext(text, q("zzz"), sel(0), { backward: false, wrap: true })).toBeNull();
  });

  it("does not get stuck on a zero-length match at the caret", () => {
    const t = "a\nb";
    const first = findNext(t, q("^", { mode: "regex" }), sel(0), { backward: false, wrap: false });
    expect(first).toEqual({ from: 2, to: 2 });
  });

  it("limits the search to the selection when a range is given", () => {
    expect(findNext("a a a", q("a"), sel(0), { backward: false, wrap: false, range: sel(2, 5) })).toEqual({ from: 2, to: 3 });
  });

  it("respects whole word", () => {
    expect(findNext("cat concat cat", q("cat", { wholeWord: true }), sel(1), { backward: false, wrap: false })).toEqual({ from: 11, to: 14 });
  });
});

describe("replace", () => {
  it("planReplaceAll replaces every match", () => {
    const text = "x y x";
    expect(apply(text, planReplaceAll(text, q("x", {}, "z")))).toBe("z y z");
  });

  it("expands capture groups in regex mode", () => {
    const text = "hello world";
    const plan = planReplaceAll(text, q("(\\w+) (\\w+)", { mode: "regex" }, "\\2 \\1"));
    expect(apply(text, plan)).toBe("world hello");
  });

  it("can insert at zero-length matches (prefix every line)", () => {
    const text = "a\nb";
    expect(apply(text, planReplaceAll(text, q("^", { mode: "regex" }, "// ")))).toBe("// a\n// b");
  });

  it("limits Replace All to a range (in selection)", () => {
    const text = "x\nx";
    expect(apply(text, planReplaceAll(text, q("x", {}, "y"), sel(0, 1)))).toBe("y\nx");
  });

  it("returns no changes when nothing matches", () => {
    expect(planReplaceAll("abc", q("z", {}, "y"))).toEqual([]);
  });

  it("planReplaceCurrent replaces the selected match and reports where to search next", () => {
    const text = "x y x";
    const plan = planReplaceCurrent(text, q("x", {}, "zz"), sel(0, 1));
    expect(plan).toEqual({ change: { from: 0, to: 1, insert: "zz" }, nextFrom: 2 });
  });

  it("planReplaceCurrent returns null when the selection is not a match", () => {
    expect(planReplaceCurrent("x y x", q("x", {}, "z"), sel(1, 2))).toBeNull();
  });

  it("is a single transaction, so one undo reverts every replacement", () => {
    const text = "x x x x x";
    const plan = planReplaceAll(text, q("x", {}, "y"));
    const state = EditorState.create({ doc: text });
    expect(plan.length).toBe(5);
    expect(state.update({ changes: plan }).state.doc.toString()).toBe("y y y y y");
  });
});
