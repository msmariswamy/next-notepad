import { describe, expect, it } from "vitest";
import { FORMATTABLE, formatCode, isFormattable } from "./format";

const opts = { tabWidth: 2, useTabs: false };
const fmt = async (lang: string, text: string, o = opts) => formatCode(lang, text, o);
const text = (r: Awaited<ReturnType<typeof fmt>>) => (r.ok ? r.text : `ERROR ${r.message}`);

describe("formatCode", () => {
  it("lists the languages from the spec", () => {
    expect([...FORMATTABLE].sort()).toEqual(["CSS", "HTML", "JSON", "Java", "JavaScript", "TypeScript", "XML", "YAML"]);
    expect(isFormattable("JSON")).toBe(true);
    expect(isFormattable("Rust")).toBe(false);
  });

  it("JavaScript", async () => {
    expect(text(await fmt("JavaScript", "function f(){return 1}"))).toBe("function f() {\n  return 1;\n}");
  });

  it("JavaScript honours the tab width and use-tabs settings", async () => {
    expect(text(await fmt("JavaScript", "function f(){return 1}", { tabWidth: 4, useTabs: false }))).toBe("function f() {\n    return 1;\n}");
    expect(text(await fmt("JavaScript", "function f(){return 1}", { tabWidth: 4, useTabs: true }))).toBe("function f() {\n\treturn 1;\n}");
  });

  it("JavaScript supports JSX and modern syntax", async () => {
    expect(text(await fmt("JavaScript", "const a=async()=>{await x?.y}"))).toBe("const a = async () => {\n  await x?.y;\n};");
  });

  it("TypeScript", async () => {
    expect(text(await fmt("TypeScript", "interface A{x:number}\nlet a:A={x:1}"))).toBe("interface A {\n  x: number;\n}\nlet a: A = { x: 1 };");
  });

  it("CSS", async () => {
    expect(text(await fmt("CSS", "a{color:red}"))).toBe("a {\n  color: red;\n}");
  });

  it("YAML", async () => {
    expect(text(await fmt("YAML", "a:   1\nb:\n   - x\n   -   y"))).toBe("a: 1\nb:\n  - x\n  - y");
  });

  it("HTML", async () => {
    expect(text(await fmt("HTML", "<div><p>Hi</p></div>"))).toBe("<div>\n  <p>Hi</p>\n</div>");
  });

  it("XML", async () => {
    expect(text(await fmt("XML", "<a><b>1</b><c/></a>"))).toBe("<a>\n  <b>1</b>\n  <c/>\n</a>");
  });

  it("Java", async () => {
    expect(text(await fmt("Java", "class A{void f(){int x=1;}}"))).toBe("class A {\n  void f() {\n    int x=1;\n  }\n}");
  });

  it("JSON honours the indentation settings", async () => {
    expect(text(await fmt("JSON", '{"a":1}'))).toBe('{\n  "a": 1\n}');
    expect(text(await fmt("JSON", '{"a":1}', { tabWidth: 4, useTabs: true }))).toBe('{\n\t"a": 1\n}');
  });

  it("reports a JavaScript syntax error with its position and leaves the caller's text alone", async () => {
    const r = await fmt("JavaScript", "function (");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).not.toContain("\n");
      expect(r.line).toBe(1);
      expect(typeof r.column).toBe("number");
    }
  });

  it("reports a CSS syntax error", async () => {
    expect((await fmt("CSS", "a{color:")).ok).toBe(false);
  });

  it("reports a YAML syntax error", async () => {
    expect((await fmt("YAML", "a: [1, 2\nb: {")).ok).toBe(false);
  });

  it("reports invalid JSON with line and column", async () => {
    const r = await fmt("JSON", '{"a":');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.line).toBe(1);
  });

  it("reports an unsupported language", async () => {
    const r = await fmt("Rust", "fn main(){}");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/no formatter/i);
  });

  it("formatting formatted code changes nothing (idempotent)", async () => {
    for (const [lang, src] of [
      ["JavaScript", "function f(){if(a){b()}else{c()}}"],
      ["CSS", "a{color:red;margin:0}"],
      ["YAML", "a:\n   - 1\n   - 2"],
      ["HTML", "<ul><li>a</li></ul>"],
      ["XML", "<a><b/></a>"],
      ["Java", "class A{void f(){if(a){b();}}}"],
      ["JSON", '{"a":[1,2]}'],
    ] as const) {
      const once = text(await fmt(lang, src));
      expect(text(await fmt(lang, once)), lang).toBe(once);
    }
  });
});
