import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { loadLanguageExtension } from "../lang/languages";
import { extractSymbols, type Symbol } from "./symbols";

async function symbolsOf(language: string, text: string): Promise<Pick<Symbol, "name" | "kind" | "line">[]> {
  const state = EditorState.create({ doc: text, extensions: [await loadLanguageExtension(language)] });
  const out = extractSymbols(state, language, 5000);
  expect(out).not.toBeNull();
  return out!.map(({ name, kind, line }) => ({ name, kind, line }));
}

describe("symbols from the syntax tree", () => {
  it("JavaScript: functions, classes, methods, arrow and function-expression consts", async () => {
    const text = "function a(){}\nclass C { m(){} }\nconst f = () => 1;\nconst g = function(){};\nconst n = 5;";
    expect(await symbolsOf("JavaScript", text)).toEqual([
      { name: "a", kind: "function", line: 1 },
      { name: "C", kind: "class", line: 2 },
      { name: "m", kind: "method", line: 2 },
      { name: "f", kind: "function", line: 3 },
      { name: "g", kind: "function", line: 4 },
    ]);
  });

  it("TypeScript: interfaces and type aliases too", async () => {
    const text = "interface I { x: number }\nfunction a(): void {}\ntype T = string;\nclass C { m(): void {} }";
    expect((await symbolsOf("TypeScript", text)).map((s) => [s.name, s.kind])).toEqual([
      ["I", "interface"],
      ["a", "function"],
      ["T", "type"],
      ["C", "class"],
      ["m", "method"],
    ]);
  });

  it("Python: functions, classes and methods", async () => {
    const text = "def a():\n  pass\nclass C:\n  def m(self):\n    pass";
    expect(await symbolsOf("Python", text)).toEqual([
      { name: "a", kind: "function", line: 1 },
      { name: "C", kind: "class", line: 3 },
      { name: "m", kind: "method", line: 4 },
    ]);
  });

  it("Rust: fn, struct, enum, trait", async () => {
    const text = "fn a() {}\nstruct S;\nenum E {A}\ntrait T {}\nimpl S { fn m(&self) {} }";
    expect((await symbolsOf("Rust", text)).map((s) => [s.name, s.kind])).toEqual([
      ["a", "function"],
      ["S", "struct"],
      ["E", "enum"],
      ["T", "trait"],
      ["m", "function"],
    ]);
  });

  it("Go: functions, methods and types", async () => {
    const text = "package x\nfunc a() {}\ntype S struct{}\nfunc (s S) m() {}";
    expect((await symbolsOf("Go", text)).map((s) => [s.name, s.kind])).toEqual([
      ["a", "function"],
      ["S", "type"],
      ["m", "method"],
    ]);
  });

  it("Java: classes, interfaces, enums and methods", async () => {
    const text = "class C { void m() {} }\ninterface I {}\nenum E {A}";
    expect((await symbolsOf("Java", text)).map((s) => [s.name, s.kind])).toEqual([
      ["C", "class"],
      ["m", "method"],
      ["I", "interface"],
      ["E", "enum"],
    ]);
  });

  it("C and C++: functions, classes, structs, namespaces", async () => {
    const text = "int a() { return 1; }\nclass C { void m(); };\nstruct S {};\nvoid C::m() {}\nnamespace N {}";
    for (const lang of ["C++", "C"]) {
      expect((await symbolsOf(lang, text)).map((s) => [s.name, s.kind])).toEqual([
        ["a", "function"],
        ["C", "class"],
        ["S", "struct"],
        ["C::m", "function"],
        ["N", "namespace"],
      ]);
    }
  });

  it("CSS: rule sets and at-rules by selector text", async () => {
    const text = "a.b, #c { color: red }\n@media print { p { x: y } }";
    expect((await symbolsOf("CSS", text)).map((s) => [s.name, s.line])).toEqual([
      ["a.b, #c", 1],
      ["@media print", 2],
      ["p", 2],
    ]);
  });

  it("Markdown: ATX and Setext headings", async () => {
    const text = "# One\ntext\n## Two ##\nSetext\n======\n";
    expect(await symbolsOf("Markdown", text)).toEqual([
      { name: "One", kind: "heading", line: 1 },
      { name: "Two", kind: "heading", line: 3 },
      { name: "Setext", kind: "heading", line: 4 },
    ]);
  });

  it("JSON: top-level keys only", async () => {
    expect((await symbolsOf("JSON", '{"a":1,\n"b":{"c":2}}')).map((s) => [s.name, s.line])).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("XML: children of the root, named by id or name when present", async () => {
    const text = "<root>\n<item id='1'/>\n<other/>\n</root>";
    expect((await symbolsOf("XML", text)).map((s) => [s.name, s.line])).toEqual([
      ["item 1", 2],
      ["other", 3],
    ]);
  });

  it("YAML: top-level keys only", async () => {
    expect((await symbolsOf("YAML", "a: 1\nb:\n  c: 2\n")).map((s) => [s.name, s.line])).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });
});

describe("symbols from line patterns", () => {
  it("SQL: CREATE FUNCTION, PROCEDURE, TABLE, VIEW", async () => {
    const text = "CREATE FUNCTION f() RETURNS int;\ncreate or replace view v as select 1;\nCREATE TABLE IF NOT EXISTS t (a int);\nselect 1;";
    expect(await symbolsOf("SQL", text)).toEqual([
      { name: "f", kind: "function", line: 1 },
      { name: "v", kind: "view", line: 2 },
      { name: "t", kind: "table", line: 3 },
    ]);
  });

  it("HTML: headings h1 to h6", async () => {
    const text = "<h1>Title</h1>\n<div><h2 class='x'>Sub <b>part</b></h2></div>";
    expect(await symbolsOf("HTML", text)).toEqual([
      { name: "Title", kind: "heading", line: 1 },
      { name: "Sub part", kind: "heading", line: 2 },
    ]);
  });

  it("Shell: functions in both syntaxes", async () => {
    const text = "build() {\n  echo hi\n}\nfunction deploy {\n  :\n}\nfunction clean() {\n}";
    expect((await symbolsOf("Shell", text)).map((s) => s.name)).toEqual(["build", "deploy", "clean"]);
  });
});

describe("edge cases", () => {
  it("plain text has no symbols", async () => {
    expect(await symbolsOf("Normal text", "just words\nand more")).toEqual([]);
  });

  it("an unknown language has no symbols", async () => {
    expect(await symbolsOf("Klingon", "qapla'")).toEqual([]);
  });

  it("an empty document has no symbols", async () => {
    expect(await symbolsOf("JavaScript", "")).toEqual([]);
  });

  it("tolerates syntax errors without throwing", async () => {
    const out = await symbolsOf("JavaScript", "function ok() {}\nfunction (((\nclass");
    expect(out[0]).toEqual({ name: "ok", kind: "function", line: 1 });
  });

  it("returns null when the tree cannot be parsed within the budget so callers keep the last list", async () => {
    const big = "function f() {}\n".repeat(50_000);
    const state = EditorState.create({ doc: big, extensions: [await loadLanguageExtension("JavaScript")] });
    expect(extractSymbols(state, "JavaScript", 0)).toBeNull();
  });
});
