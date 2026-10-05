import { describe, expect, it } from "vitest";
import { jsonToYaml, yamlToJson } from "./yamlJson";

const ctx = { selection: false };
const okText = (r: { ok: boolean; text?: string; message?: string }) => {
  if (!r.ok) throw new Error(`expected ok, got: ${r.message}`);
  return r.text!;
};

describe("jsonToYaml", () => {
  it("converts nested data to block style with a 2-space indent", async () => {
    expect(okText(await jsonToYaml('{"name": "x", "list": [1, 2], "o": {"k": true}}', ctx))).toBe("name: x\nlist:\n  - 1\n  - 2\no:\n  k: true");
  });
  it("keeps key order, even for integer-like keys", async () => {
    expect(okText(await jsonToYaml('{"b": 1, "a": 2}', ctx))).toBe("b: 1\na: 2");
    expect(okText(await jsonToYaml('{"b": 1, "1": 2}', ctx))).toBe('b: 1\n"1": 2');
  });
  it("keeps the digits of large integers", async () => {
    expect(okText(await jsonToYaml('{"id": 12345678901234567890}', ctx))).toContain("12345678901234567890");
  });
  it("quotes strings that look like other types so parsing gives the same strings", async () => {
    const out = okText(await jsonToYaml('{"a": "true", "b": "123", "c": "null", "d": "1.5", "e": "no"}', ctx));
    const { parse } = await import("yaml");
    expect(parse(out)).toEqual({ a: "true", b: "123", c: "null", d: "1.5", e: "no" });
  });
  it("handles scalars, empty collections and null", async () => {
    expect(okText(await jsonToYaml("null", ctx))).toBe("null");
    expect(okText(await jsonToYaml('{"a": [], "b": {}, "c": null}', ctx))).toBe("a: []\nb: {}\nc: null");
  });
  it("keeps the source's trailing newline", async () => {
    expect(okText(await jsonToYaml('{"a": 1}\n', ctx))).toBe("a: 1\n");
  });
  it("round-trips through YAML back to the same JSON data", async () => {
    const src = '{"a": [1, {"b": "two"}], "c": null, "d": 1.5}';
    const back = okText(await yamlToJson(okText(await jsonToYaml(src, ctx)), ctx));
    expect(JSON.parse(back)).toEqual(JSON.parse(src));
  });
  it("reports invalid JSON with its position and no output", async () => {
    expect(await jsonToYaml('{"a": }', ctx)).toMatchObject({ ok: false, line: 1, column: 7 });
  });
});

describe("yamlToJson", () => {
  it("converts a single document to its value with a 2-space indent", async () => {
    expect(okText(await yamlToJson("a: 1\nb: [x, y]", ctx))).toBe('{\n  "a": 1,\n  "b": [\n    "x",\n    "y"\n  ]\n}');
  });
  it("converts several documents to an array in order", async () => {
    const out = JSON.parse(okText(await yamlToJson("a: 1\n---\nb: 2\n", ctx)));
    expect(out).toEqual([{ a: 1 }, { b: 2 }]);
  });
  it("expands aliases", async () => {
    expect(JSON.parse(okText(await yamlToJson("base: &b {x: 1}\ncopy: *b\n", ctx)))).toEqual({ base: { x: 1 }, copy: { x: 1 } });
  });
  it("keeps key order, even for integer-like keys", async () => {
    const r = await yamlToJson("b: 1\n'1': 2\n", ctx);
    expect(okText(r).indexOf('"b"')).toBeLessThan(okText(r).indexOf('"1"'));
  });
  it("drops comments and says so", async () => {
    const r = await yamlToJson("# note\na: 1 # one\n", ctx);
    expect(r).toMatchObject({ ok: true, warnings: ["comments were dropped"] });
    expect(okText(r)).not.toMatch(/#|note/);
  });
  it("has no warnings for plain data", async () => {
    const r = await yamlToJson("a: 1\n", ctx);
    expect(r.ok && r.warnings).toBeFalsy();
  });
  it("converts non-string keys to strings and warns", async () => {
    const r = await yamlToJson("1: one\ntrue: two\n", ctx);
    expect(JSON.parse(okText(r))).toEqual({ "1": "one", true: "two" });
    expect(r).toMatchObject({ ok: true, warnings: ["keys that were not strings became strings"] });
  });
  it("refuses .nan and .inf, naming the key path", async () => {
    expect(await yamlToJson("n: .nan\n", ctx)).toMatchObject({ ok: false, message: expect.stringContaining("n is .nan") });
    expect(await yamlToJson("a:\n  - 1\n  - b: -.inf\n", ctx)).toMatchObject({ ok: false, message: expect.stringContaining("a[1].b") });
  });
  it("warns about integers beyond 2^53", async () => {
    const r = await yamlToJson("id: 12345678901234567890\n", ctx);
    expect(r).toMatchObject({ ok: true, warnings: ["integers beyond 2^53 may have lost precision"] });
  });
  it("refuses an alias bomb with an explanation", async () => {
    let src = "a0: &a0 [x, x, x, x, x, x, x, x, x, x]\n";
    for (let i = 1; i < 6; i++) src += `a${i}: &a${i} [${Array.from({ length: 10 }, () => `*a${i - 1}`).join(", ")}]\n`;
    const r = await yamlToJson(src, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/alias/i);
  });
  it("reports invalid YAML with its position and no output", async () => {
    expect(await yamlToJson("a: [1, 2\nb: 3", ctx)).toMatchObject({ ok: false });
  });
  it("handles scalars, empty documents and null", async () => {
    expect(okText(await yamlToJson("42", ctx))).toBe("42");
    expect(okText(await yamlToJson("a:", ctx))).toBe('{\n  "a": null\n}');
  });
  it("prints empty collections compactly", async () => {
    expect(okText(await yamlToJson("a: []\nb: {}", ctx))).toBe('{\n  "a": [],\n  "b": {}\n}');
  });
  it("keeps the source's trailing newline", async () => {
    expect(okText(await yamlToJson("a: 1\n", ctx)).endsWith("\n")).toBe(true);
    expect(okText(await yamlToJson("a: 1", ctx)).endsWith("\n")).toBe(false);
  });
});
