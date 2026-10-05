import { describe, expect, it } from "vitest";
import {
  convertCase,
  duplicateLines,
  eolToSpace,
  insertBlank,
  joinLines,
  randomizeLines,
  removeConsecutiveDuplicateLines,
  removeDuplicateLines,
  removeEmptyLines,
  reverseLines,
  sortLines,
  spaceToTabAll,
  spaceToTabLeading,
  splitLines,
  tabToSpace,
  trimBoth,
  trimBothAndEol,
  trimLeading,
  trimTrailing,
} from "./transforms";

describe("convertCase", () => {
  it("upper and lower", () => {
    expect(convertCase("Hello World", "upper")).toBe("HELLO WORLD");
    expect(convertCase("Hello World", "lower")).toBe("hello world");
  });

  it("proper case lowercases the rest of each word", () => {
    expect(convertCase("hELLO wORLD", "proper")).toBe("Hello World");
    expect(convertCase("don't STOP", "proper")).toBe("Don't Stop");
  });

  it("proper case (blend) only capitalises the first letter of each word", () => {
    expect(convertCase("hello WORLD iPhone", "properBlend")).toBe("Hello WORLD IPhone");
  });

  it("sentence case capitalises sentence starts and lowercases the rest", () => {
    expect(convertCase("hello. WORLD is here! ok", "sentence")).toBe("Hello. World is here! Ok");
    expect(convertCase("what? yes", "sentence")).toBe("What? Yes");
  });

  it("sentence case (blend) keeps the rest as written", () => {
    expect(convertCase("hello. WORLD is here! ok", "sentenceBlend")).toBe("Hello. WORLD is here! Ok");
  });

  it("invert case", () => {
    expect(convertCase("aBc 1", "invert")).toBe("AbC 1");
  });

  it("random case keeps the letters and length", () => {
    const out = convertCase("Hello World", "random");
    expect(out.toLowerCase()).toBe("hello world");
    expect(out.length).toBe(11);
  });

  it("random case uses the supplied generator (deterministic in tests)", () => {
    expect(convertCase("abcd", "random", () => 0.1)).toBe("ABCD");
    expect(convertCase("ABCD", "random", () => 0.9)).toBe("abcd");
  });

  it("handles non-ASCII letters", () => {
    expect(convertCase("élan ÉCOLE", "proper")).toBe("Élan École");
  });

  it("leaves digits and punctuation alone", () => {
    expect(convertCase("a1-b2", "upper")).toBe("A1-B2");
  });
});

describe("line operations", () => {
  it("duplicates lines", () => {
    expect(duplicateLines(["b"])).toEqual(["b", "b"]);
    expect(duplicateLines(["a", "b"])).toEqual(["a", "b", "a", "b"]);
  });

  it("removes duplicate lines keeping the first occurrence", () => {
    expect(removeDuplicateLines(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
  });

  it("removes only consecutive duplicates", () => {
    expect(removeConsecutiveDuplicateLines(["a", "a", "b", "a"])).toEqual(["a", "b", "a"]);
  });

  it("joins lines with a space", () => {
    expect(joinLines(["a", "b", "c"])).toEqual(["a b c"]);
  });

  it("splits long lines at word boundaries within the width", () => {
    expect(splitLines(["aaa bbb ccc"], 7)).toEqual(["aaa bbb", "ccc"]);
  });

  it("splits a word longer than the width hard", () => {
    expect(splitLines(["abcdefghij"], 4)).toEqual(["abcd", "efgh", "ij"]);
  });

  it("leaves short lines alone when splitting", () => {
    expect(splitLines(["ab", "cd"], 10)).toEqual(["ab", "cd"]);
  });

  it("removes empty lines, optionally those with only blanks", () => {
    const lines = ["a", "", "b", "  ", "c"];
    expect(removeEmptyLines(lines, false)).toEqual(["a", "b", "  ", "c"]);
    expect(removeEmptyLines(lines, true)).toEqual(["a", "b", "c"]);
  });

  it("inserts a blank line above or below", () => {
    expect(insertBlank(["a", "b"], 1, "above")).toEqual(["a", "", "b"]);
    expect(insertBlank(["a", "b"], 0, "below")).toEqual(["a", "", "b"]);
  });

  it("reverses line order", () => {
    expect(reverseLines(["1", "2", "3"])).toEqual(["3", "2", "1"]);
  });

  it("randomizes using the generator and keeps all lines", () => {
    const out = randomizeLines(["a", "b", "c", "d"], () => 0);
    expect([...out].sort()).toEqual(["a", "b", "c", "d"]);
    expect(randomizeLines([], () => 0)).toEqual([]);
  });
});

describe("sortLines", () => {
  it("lexicographic ascending and descending (by code unit)", () => {
    expect(sortLines(["b", "C", "a"], "lex", "asc")).toEqual(["C", "a", "b"]);
    expect(sortLines(["b", "C", "a"], "lex", "desc")).toEqual(["b", "a", "C"]);
  });

  it("ignoring case", () => {
    expect(sortLines(["b", "C", "a"], "lexIgnoreCase", "asc")).toEqual(["a", "b", "C"]);
    expect(sortLines(["b", "C", "a"], "lexIgnoreCase", "desc")).toEqual(["C", "b", "a"]);
  });

  it("locale order puts accented letters next to their base letter", () => {
    expect(sortLines(["z", "é", "e", "a"], "locale", "asc")).toEqual(["a", "e", "é", "z"]);
  });

  it("integers sort numerically, not lexicographically", () => {
    expect(sortLines(["10", "9", "100"], "integer", "asc")).toEqual(["9", "10", "100"]);
    expect(sortLines(["10", "9", "100"], "integer", "desc")).toEqual(["100", "10", "9"]);
  });

  it("integer sort handles negatives and leading text-free numbers; non-numeric lines come first", () => {
    expect(sortLines(["3", "-2", "x", "0"], "integer", "asc")).toEqual(["x", "-2", "0", "3"]);
  });

  it("decimals with comma", () => {
    expect(sortLines(["1,5", "1,25", "10,0"], "decimalComma", "asc")).toEqual(["1,25", "1,5", "10,0"]);
  });

  it("decimals with dot", () => {
    expect(sortLines(["1.5", "1.25", "10.0"], "decimalDot", "asc")).toEqual(["1.25", "1.5", "10.0"]);
  });

  it("length", () => {
    expect(sortLines(["ccc", "a", "bb"], "length", "asc")).toEqual(["a", "bb", "ccc"]);
    expect(sortLines(["ccc", "a", "bb"], "length", "desc")).toEqual(["ccc", "bb", "a"]);
  });

  it("is stable for equal keys in both directions", () => {
    expect(sortLines(["b1", "a", "b2"], "length", "asc")).toEqual(["a", "b1", "b2"]);
    expect(sortLines(["b1", "a", "b2"], "length", "desc")).toEqual(["b1", "b2", "a"]);
  });

  it("does not mutate its input", () => {
    const input = ["b", "a"];
    sortLines(input, "lex", "asc");
    expect(input).toEqual(["b", "a"]);
  });
});

describe("blank operations", () => {
  it("trims trailing space and tabs", () => {
    expect(trimTrailing("a  \n b \t")).toBe("a\n b");
  });

  it("trims leading space and tabs", () => {
    expect(trimLeading("  a\n\t b")).toBe("a\nb");
  });

  it("trims both", () => {
    expect(trimBoth("  a  \n\tb\t")).toBe("a\nb");
  });

  it("EOL to space", () => {
    expect(eolToSpace("a\nb\nc")).toBe("a b c");
  });

  it("trim both and EOL to space", () => {
    expect(trimBothAndEol("  a  \n  b  ")).toBe("a b");
  });

  it("tab to space expands to the next tab stop", () => {
    expect(tabToSpace("\tx", 4)).toBe("    x");
    expect(tabToSpace("ab\tx", 4)).toBe("ab  x");
    expect(tabToSpace("a\n\tb", 2)).toBe("a\n  b");
  });

  it("space to tab (leading) converts whole tab stops and keeps the remainder as spaces", () => {
    expect(spaceToTabLeading("    x", 4)).toBe("\tx");
    expect(spaceToTabLeading("      x", 4)).toBe("\t  x");
    expect(spaceToTabLeading("  x", 4)).toBe("  x");
  });

  it("space to tab (leading) leaves inner spaces alone", () => {
    expect(spaceToTabLeading("    a    b", 4)).toBe("\ta    b");
  });

  it("space to tab (all) converts runs that reach a tab stop", () => {
    expect(spaceToTabAll("a    b", 4)).toBe("a\t b");
    expect(spaceToTabAll("a b", 4)).toBe("a b");
    expect(spaceToTabAll("ab  cd", 4)).toBe("ab\tcd");
  });

  it("space and tab conversions round-trip for leading indentation", () => {
    const src = "        deep\n    mid\nflat";
    expect(tabToSpace(spaceToTabLeading(src, 4), 4)).toBe(src);
  });
});
