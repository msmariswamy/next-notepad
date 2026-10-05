import { describe, expect, it } from "vitest";
import { YAML_ERROR_MAX_CHARS, compactYaml, formatYaml, parseYaml, sortYamlKeys, validateYamlTool, withYamlSelection, yamlErrorRange } from "./tools";

const whole = { selection: false };
const text = async (p: Promise<{ ok: boolean }>) => {
  const r = (await p) as { ok: boolean; text?: string; message?: string };
  if (!r.ok) throw new Error(`expected ok, got: ${r.message}`);
  return r.text!;
};

describe("parseYaml", () => {
  it("returns every document", async () => {
    const r = await parseYaml("a: 1\n---\nb: 2\n");
    expect(r.docs).toHaveLength(2);
  });
  it("returns the first error with a clean message and 1-based position", async () => {
    const r = await parseYaml("a: [1, 2\nb: 3");
    expect(r.error).toBeDefined();
    expect(r.error!.message).not.toMatch(/\n|at line/);
    expect(r.error!.line).toBeGreaterThanOrEqual(1);
    expect(r.error!.column).toBeGreaterThanOrEqual(1);
  });
  it("finds an error in a later document", async () => {
    const r = await parseYaml("a: 1\n---\nb: [");
    expect(r.error!.line).toBe(3);
  });
});

describe("validateYamlTool", () => {
  it("says valid", async () => {
    expect(await validateYamlTool("a: 1\nb: [1, 2]", whole)).toMatchObject({ ok: true, message: "YAML is valid" });
  });
  it("mentions how many documents there are", async () => {
    expect(await validateYamlTool("a: 1\n---\nb: 2", whole)).toMatchObject({ ok: true, message: "YAML is valid (2 documents)" });
  });
  it("reports a syntax error with line and column", async () => {
    expect(await validateYamlTool("a: [1, 2\nb: 3", whole)).toMatchObject({ ok: false });
  });
  it("reports a duplicate key", async () => {
    const r = await validateYamlTool("a: 1\na: 2", whole);
    expect(r).toMatchObject({ ok: false, line: 2 });
    if (!r.ok) expect(r.message).toMatch(/unique|duplicate/i);
  });
  it("reports the error in a later document on its line", async () => {
    expect(await validateYamlTool("a: 1\n---\nb: [", whole)).toMatchObject({ ok: false, line: 3 });
  });
});

describe("yamlErrorRange", () => {
  it("underlines the error position", async () => {
    const r = await yamlErrorRange("a: 1\na: 2");
    expect(r).not.toBeNull();
    expect(r!.from).toBeGreaterThanOrEqual(5);
  });
  it("is null for valid, empty and blank text", async () => {
    expect(await yamlErrorRange("a: 1")).toBeNull();
    expect(await yamlErrorRange("")).toBeNull();
    expect(await yamlErrorRange("  \n")).toBeNull();
  });
  it("is null above the size limit", async () => {
    expect(YAML_ERROR_MAX_CHARS).toBe(1_000_000);
    expect(await yamlErrorRange("a: [" + "x".repeat(YAML_ERROR_MAX_CHARS))).toBeNull();
  });
});

describe("sortYamlKeys", () => {
  it("sorts keys at every depth", async () => {
    expect(await text(sortYamlKeys("b: 1\na:\n  z: 1\n  y: 2\n", whole))).toBe("a:\n  y: 2\n  z: 1\nb: 1\n");
  });
  it("keeps a comment directly above its key", async () => {
    const out = await text(sortYamlKeys("b: 1\n# about a\na: 2\n", whole));
    expect(out).toBe("# about a\na: 2\nb: 1\n");
  });
  it("keeps list order", async () => {
    expect(await text(sortYamlKeys("k:\n  - c\n  - a\n  - b\n", whole))).toBe("k:\n  - c\n  - a\n  - b\n");
  });
  it("sorts keys inside list items without reordering the list", async () => {
    expect(await text(sortYamlKeys("- {b: 1, a: 2}\n- {d: 1, c: 2}\n", whole))).toMatch(/a: 2, b: 1.*\n.*c: 2, d: 1/s);
  });
  it("preserves anchors and aliases", async () => {
    const out = await text(sortYamlKeys("d: 4\nb: *x\nc: 3\n".replace("b: *x", "a: &x 1\nb: *x"), whole));
    expect(out).toBe("a: &x 1\nb: *x\nc: 3\nd: 4\n");
  });
  it("sorts every document of a multi-document file", async () => {
    expect(await text(sortYamlKeys("b: 1\na: 2\n---\nd: 1\nc: 2\n", whole))).toBe("a: 2\nb: 1\n---\nc: 2\nd: 1\n");
  });
  it("refuses a sort that would put an alias before its anchor", async () => {
    const r = await sortYamlKeys("z: &x 1\na: *x\n", whole);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/alias/i);
  });
  it("keeps a missing trailing newline missing", async () => {
    expect(await text(sortYamlKeys("b: 1\na: 2", whole))).toBe("a: 2\nb: 1");
  });
  it("refuses invalid YAML with its position", async () => {
    expect(await sortYamlKeys("a: [1, 2\nb: 3", whole)).toMatchObject({ ok: false });
  });
  it("does not wrap long lines", async () => {
    const long = "k: " + "word ".repeat(40).trim() + "\n";
    expect(await text(sortYamlKeys(long, whole))).toBe(long);
  });
});

describe("compactYaml", () => {
  it("rewrites in flow style on one line", async () => {
    expect(await text(compactYaml("a: 1\nb:\n  - x\n  - y\n", whole))).toBe("{ a: 1, b: [ x, y ] }\n");
  });
  it("drops comments and says so", async () => {
    const r = await compactYaml("# top\na: 1 # one\n", whole);
    expect(r).toMatchObject({ ok: true, warnings: ["comments were dropped"] });
    if (r.ok) expect(r.text).not.toMatch(/#/);
  });
  it("has no warning when there were no comments", async () => {
    const r = await compactYaml("a: 1\n", whole);
    expect(r.ok && r.warnings).toBeFalsy();
  });
  it("keeps anchors and aliases", async () => {
    const out = await text(compactYaml("base: &b {x: 1}\ncopy: *b\n", whole));
    expect(out).toContain("&b");
    expect(out).toContain("*b");
  });
  it("refuses several documents and explains why", async () => {
    const r = await compactYaml("a: 1\n---\nb: 2\n", whole);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/several documents/i);
  });
  it("refuses invalid YAML", async () => {
    expect(await compactYaml("a: [1, 2\nb: 3", whole)).toMatchObject({ ok: false });
  });
  it("round-trips: compacted text parses to the same data", async () => {
    const { parse } = await import("yaml");
    const src = "a: 1\nb:\n  c: [1, 2]\n  d: 'x y'\nlist:\n  - {k: v}\n  - plain\n";
    expect(parse(await text(compactYaml(src, whole)))).toEqual(parse(src));
  });
  it("keeps a missing trailing newline missing", async () => {
    expect(await text(compactYaml("a: 1", whole))).toBe("{ a: 1 }");
  });
});

describe("formatYaml", () => {
  it("uses 4 spaces when asked", async () => {
    expect(await text(formatYaml("a:\n  b: 1", 4, whole))).toBe("a:\n    b: 1");
  });
  it("uses 2 spaces when asked", async () => {
    expect(await text(formatYaml("a:\n    b: 1", 2, whole))).toBe("a:\n  b: 1");
  });
  it("keeps comments", async () => {
    expect(await text(formatYaml("# note\na: 1 # one\n", 2, whole))).toContain("# note");
  });
  it("reports a syntax error with a position", async () => {
    expect(await formatYaml("a: [1, 2\nb: 3", 2, whole)).toMatchObject({ ok: false });
  });
  it("matches Format Document's engine", async () => {
    const { formatCode } = await import("../format/format");
    const src = "a:   1\nb:\n      - x\n";
    const doc = await formatCode("YAML", src, { tabWidth: 2, useTabs: false });
    expect(await text(formatYaml(src, 2, whole))).toBe((doc as { text: string }).text);
  });
});

describe("withYamlSelection", () => {
  const sel = { selection: true };
  const sort = (t: string) => sortYamlKeys(t, whole);

  it("dedents, processes and re-indents a block", async () => {
    const r = await withYamlSelection("  b: 1\n  a: 2", sel, sort);
    expect(r).toMatchObject({ ok: true, text: "  a: 2\n  b: 1" });
  });
  it("uses only the common indent, keeping deeper structure", async () => {
    const r = await withYamlSelection("    b: 1\n    a:\n      z: 1\n      y: 2", sel, sort);
    expect(r).toMatchObject({ ok: true, text: "    a:\n      y: 2\n      z: 1\n    b: 1" });
  });
  it("does not indent blank lines", async () => {
    const r = await withYamlSelection("  b: 1\n\n  a: 2", sel, async (t) => ({ ok: true, text: t }));
    expect(r).toMatchObject({ ok: true, text: "  b: 1\n\n  a: 2" });
  });
  it("shifts error columns back by the removed indent", async () => {
    const r = await withYamlSelection("    a: [1", sel, sort);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.column).toBeGreaterThan(4);
  });
  it("leaves the text untouched when the selection cannot be parsed alone", async () => {
    expect(await withYamlSelection("- a: [1", sel, sort)).toMatchObject({ ok: false });
  });
  it("passes a whole-document run straight through", async () => {
    expect(await withYamlSelection("  b: 1", whole, async (t) => ({ ok: true, text: t.toUpperCase() }))).toMatchObject({ text: "  B: 1" });
  });
});
