import { describe, expect, it } from "vitest";
import cases from "../../shared/regex-cases.json";
import {
  DEFAULT_PATTERN_OPTIONS,
  expandExtended,
  expandReplacement,
  needsJsEngine,
  toJsRegExp,
  translateRegexToJs,
  type PatternOptions,
  type SearchMode,
} from "./regexCompat";

interface MatchCase {
  name: string;
  pattern: string;
  mode: SearchMode;
  matchCase?: boolean;
  wholeWord?: boolean;
  dotMatchesNewline?: boolean;
  text: string;
  matches: string[];
  needsJs?: boolean;
}
interface ReplaceCase {
  name: string;
  pattern: string;
  mode: SearchMode;
  replacement: string;
  text: string;
  result: string;
}

const optsOf = (c: MatchCase | ReplaceCase): PatternOptions => ({
  ...DEFAULT_PATTERN_OPTIONS,
  mode: c.mode,
  matchCase: "matchCase" in c ? !!c.matchCase : false,
  wholeWord: "wholeWord" in c ? !!c.wholeWord : false,
  dotMatchesNewline: "dotMatchesNewline" in c ? !!c.dotMatchesNewline : false,
});

describe("shared cross-engine table: matching (JS engine)", () => {
  for (const c of cases.matchCases as MatchCase[]) {
    it(c.name, () => {
      const re = toJsRegExp(c.pattern, optsOf(c));
      expect([...c.text.matchAll(re)].map((m) => m[0])).toEqual(c.matches);
    });
    it(`${c.name} [needsJsEngine]`, () => {
      expect(needsJsEngine(c.pattern, optsOf(c))).toBe(!!c.needsJs);
    });
  }
});

describe("shared cross-engine table: replacement (JS engine)", () => {
  for (const c of cases.replaceCases as ReplaceCase[]) {
    it(c.name, () => {
      const re = toJsRegExp(c.pattern, optsOf(c));
      const out = c.text.replace(re, (...args) => {
        // args: match, p1..pn, offset, string[, groups]
        const groups = args.slice(0, args.findIndex((a) => typeof a === "number")) as (string | undefined)[];
        return expandReplacement(c.replacement, groups, c.mode);
      });
      expect(out).toBe(c.result);
    });
  }
});

describe("expandExtended", () => {
  it("expands the supported escapes", () => {
    expect(expandExtended("\\n\\r\\t\\0\\\\")).toBe("\n\r\t\0\\");
    expect(expandExtended("\\x41\\u00e9")).toBe("Aé");
  });
  it("keeps unknown escapes and a trailing backslash", () => {
    expect(expandExtended("\\q")).toBe("\\q");
    expect(expandExtended("a\\")).toBe("a\\");
  });
  it("leaves a malformed hex escape alone", () => {
    expect(expandExtended("\\xZZ")).toBe("\\xZZ");
  });
});

describe("translateRegexToJs", () => {
  it("handles \\h inside a character class", () => {
    expect(translateRegexToJs("[\\h,]")).toBe("[ \\t,]");
  });
  it("encodes astral code points as a surrogate pair group", () => {
    const re = toJsRegExp("\\x{1F600}", { ...DEFAULT_PATTERN_OPTIONS, mode: "regex" });
    expect("a😀b".match(re)?.[0]).toBe("😀");
  });
  it("converts (?P=name) backreferences", () => {
    const re = toJsRegExp("(?P<c>\\w)(?P=c)", { ...DEFAULT_PATTERN_OPTIONS, mode: "regex" });
    expect("aab".match(re)?.[0]).toBe("aa");
  });
  it("maps \\A and \\z to start/end of the whole text", () => {
    const o = { ...DEFAULT_PATTERN_OPTIONS, mode: "regex" as const };
    expect("a\na".match(toJsRegExp("\\Aa", o, "g"))?.length).toBe(1);
    expect("a\na".match(toJsRegExp("a\\z", o, "g"))?.length).toBe(1);
  });
  it("throws a SyntaxError for an invalid pattern so the UI can show an inline error", () => {
    expect(() => toJsRegExp("(unclosed", { ...DEFAULT_PATTERN_OPTIONS, mode: "regex" })).toThrow(SyntaxError);
  });
});

describe("needsJsEngine", () => {
  const regex = { ...DEFAULT_PATTERN_OPTIONS, mode: "regex" as const };
  it("does not flag lookaround text inside a character class", () => {
    expect(needsJsEngine("[(?=]x", regex)).toBe(false);
  });
  it("does not flag an escaped paren followed by =", () => {
    expect(needsJsEngine("\\(?=x", regex)).toBe(false);
  });
  it("flags named backreferences", () => {
    expect(needsJsEngine("(?<a>x)\\k<a>", regex)).toBe(true);
  });
  it("never flags normal or extended searches without whole word", () => {
    expect(needsJsEngine("(?=x)\\1", { ...DEFAULT_PATTERN_OPTIONS, mode: "normal" })).toBe(false);
  });
});
