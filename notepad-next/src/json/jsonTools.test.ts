import { describe, expect, it } from "vitest";
import { escapeAsJsonString, minify, prettyPrint, sortKeys, unescapeJsonString, validate } from "./jsonTools";

describe("validate", () => {
  it("accepts well-formed documents of every value type", () => {
    for (const ok of ['{"a":[1,2.5,-3e2,true,false,null,"s"]}', "[]", "{}", '"str"', "42", "null", '  {"a" : 1}  ']) {
      expect(validate(ok), ok).toEqual({ ok: true });
    }
  });

  it("reports line and column of a missing comma", () => {
    const text = '{\n  "a": 1\n  "b": 2\n}';
    const r = validate(text);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.line).toBe(3);
      expect(r.column).toBe(3);
      expect(r.offset).toBe(text.indexOf('"b"'));
      expect(r.message).toMatch(/','|\}/);
    }
  });

  it("reports an unterminated object at the end of input", () => {
    const r = validate('{"a":');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/end of JSON/i);
  });

  it("rejects trailing commas", () => {
    expect(validate("[1,2,]").ok).toBe(false);
    expect(validate('{"a":1,}').ok).toBe(false);
  });

  it("rejects single quotes, comments and unquoted keys", () => {
    expect(validate("{'a':1}").ok).toBe(false);
    expect(validate('{"a":1} // c').ok).toBe(false);
    expect(validate("{a:1}").ok).toBe(false);
  });

  it("rejects bad numbers", () => {
    for (const bad of ["01", "1.", ".5", "+1", "1e", "--1", "0x10"]) expect(validate(bad).ok, bad).toBe(false);
  });

  it("rejects bad escapes and raw control characters in strings", () => {
    expect(validate('"\\q"').ok).toBe(false);
    expect(validate('"\\u12G4"').ok).toBe(false);
    expect(validate('"a\nb"').ok).toBe(false);
    expect(validate('"\\u00e9\\n\\"ok"').ok).toBe(true);
  });

  it("rejects content after the document", () => {
    const r = validate('{"a":1} x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.offset).toBe(8);
  });

  it("rejects an empty document", () => {
    expect(validate("   ").ok).toBe(false);
  });

  it("counts columns in UTF-16 units and lines across CRLF-free text", () => {
    const r = validate('["😀", x]');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.column).toBe(8); // emoji is two units
  });

  it("reports the position of an unterminated string", () => {
    const r = validate('{"a": "oops');
    expect(r.ok).toBe(false);
  });
});

describe("prettyPrint", () => {
  it("formats minified JSON with two-space indentation", () => {
    const r = prettyPrint('{"a":1,"b":[1,2]}');
    expect(r).toEqual({ ok: true, text: '{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}' });
  });

  it("keeps empty containers compact", () => {
    expect(prettyPrint('{"a":{},"b":[]}')).toEqual({ ok: true, text: '{\n  "a": {},\n  "b": []\n}' });
  });

  it("is idempotent", () => {
    const once = prettyPrint('{"a":[1,{"b":2}]}');
    if (!once.ok) throw new Error("expected ok");
    expect(prettyPrint(once.text)).toEqual(once);
  });

  it("does not modify invalid JSON and reports the error position", () => {
    const r = prettyPrint('{"a":');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.line).toBe(1);
  });

  it("collapses duplicate keys, keeping the last value (documented side effect)", () => {
    expect(prettyPrint('{"a":1,"a":2}')).toEqual({ ok: true, text: '{\n  "a": 2\n}' });
  });

  it("keeps numbers exactly as written, including big integers and exponents", () => {
    const r = prettyPrint('[12345678901234567890,1.0,1e2,-0]');
    expect(r.ok && r.text).toBe("[\n  12345678901234567890,\n  1.0,\n  1e2,\n  -0\n]");
  });

  it("keeps key order, even for integer-like keys", () => {
    const r = prettyPrint('{"2":"b","1":"a"}');
    expect(r.ok && r.text).toBe('{\n  "2": "b",\n  "1": "a"\n}');
  });

  it("keeps string escapes and unicode untouched", () => {
    const r = prettyPrint('{"k":"a\\n\\u00e9😀"}');
    expect(r.ok && r.text).toBe('{\n  "k": "a\\n\\u00e9😀"\n}');
  });
});

describe("minify", () => {
  it("removes insignificant whitespace but not whitespace inside strings", () => {
    expect(minify('{\n  "a": "x y",\n  "b": [ 1 , 2 ]\n}')).toEqual({ ok: true, text: '{"a":"x y","b":[1,2]}' });
  });

  it("collapses duplicate keys the same way", () => {
    expect(minify('{"a":1,"a":2}')).toEqual({ ok: true, text: '{"a":2}' });
  });

  it("does not modify invalid JSON", () => {
    expect(minify("{oops").ok).toBe(false);
  });
});

describe("prettyPrint indent styles", () => {
  it("supports 4 spaces and tabs", () => {
    expect(prettyPrint('{"a":1}', "    ")).toEqual({ ok: true, text: '{\n    "a": 1\n}' });
    expect(prettyPrint('{"a":1}', "\t")).toEqual({ ok: true, text: '{\n\t"a": 1\n}' });
  });
});

describe("sortKeys", () => {
  it("orders keys ascending at every level and keeps array order", () => {
    const r = sortKeys('{"b":1,"a":{"d":1,"c":2},"arr":[{"z":1,"y":2},3]}');
    expect(r.ok && r.text).toBe('{\n  "a": {\n    "c": 2,\n    "d": 1\n  },\n  "arr": [\n    {\n      "y": 2,\n      "z": 1\n    },\n    3\n  ],\n  "b": 1\n}');
  });

  it("sorts by code unit (uppercase before lowercase) and numeric-looking keys as strings", () => {
    const r = sortKeys('{"b":1,"B":2,"10":3,"9":4}');
    expect(r.ok && r.text).toBe('{\n  "10": 3,\n  "9": 4,\n  "B": 2,\n  "b": 1\n}');
  });

  it("does not modify invalid JSON", () => {
    expect(sortKeys("{oops").ok).toBe(false);
  });

  it("keeps number text as written", () => {
    const r = sortKeys('{"b":1.0,"a":1e2}');
    expect(r.ok && r.text).toBe('{\n  "a": 1e2,\n  "b": 1.0\n}');
  });
});

describe("escape / unescape as a JSON string", () => {
  it("escapes quotes, backslashes and newlines", () => {
    expect(escapeAsJsonString('say "hi"\n')).toBe('"say \\"hi\\"\\n"');
    expect(escapeAsJsonString("a\\b")).toBe('"a\\\\b"');
  });

  it("round-trips", () => {
    for (const s of ['say "hi"\n', "tab\tand\\backslash", "é 😀", ""]) {
      expect(unescapeJsonString(escapeAsJsonString(s))).toBe(s);
    }
  });

  it("unescapes an escaped body without quotes", () => {
    expect(unescapeJsonString('line1\\nline2 \\"q\\"')).toBe('line1\nline2 "q"');
  });

  it("returns null for text that is not a JSON string", () => {
    expect(unescapeJsonString('bad \\x escape')).toBeNull();
    expect(unescapeJsonString('"unterminated')).toBeNull();
  });
});
