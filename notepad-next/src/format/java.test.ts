import { describe, expect, it } from "vitest";
import { formatJava } from "./java";

const f = (s: string, unit = "  ") => formatJava(s, unit);
const ok = (r: ReturnType<typeof formatJava>) => (r.ok ? r.text : `ERROR ${r.message}`);

describe("formatJava", () => {
  it("opens an indented block after each brace (the spec example)", () => {
    expect(ok(f("class A{void f(){int x=1;}}"))).toBe("class A {\n  void f() {\n    int x=1;\n  }\n}");
  });

  it("puts each statement on its own line", () => {
    expect(ok(f("void f(){a();b();c();}"))).toBe("void f() {\n  a();\n  b();\n  c();\n}");
  });

  it("does not split a for header at its semicolons", () => {
    expect(ok(f("void f(){for(int i=0;i<3;i++){g(i);}}"))).toBe("void f() {\n  for(int i=0;i<3;i++) {\n    g(i);\n  }\n}");
  });

  it("keeps else, catch and finally on the closing-brace line", () => {
    expect(ok(f("void f(){if(a){b();}else{c();}try{d();}catch(E e){h();}finally{z();}}"))).toBe(
      "void f() {\n  if(a) {\n    b();\n  } else {\n    c();\n  }\n  try {\n    d();\n  } catch(E e) {\n    h();\n  } finally {\n    z();\n  }\n}",
    );
  });

  it("keeps array initialisers inline", () => {
    expect(ok(f("class A{int[] a={1,2,3};}"))).toBe("class A {\n  int[] a={1,2,3};\n}");
  });

  it("never touches the contents of strings or char literals", () => {
    expect(ok(f('class A{String s="a;{b}//c";char c=\'{\';}'))).toBe("class A {\n  String s=\"a;{b}//c\";\n  char c='{';\n}");
  });

  it("handles escaped quotes inside strings", () => {
    expect(ok(f('class A{String s="say \\"hi\\";";}'))).toBe('class A {\n  String s="say \\"hi\\";";\n}');
  });

  it("keeps line comments on their line", () => {
    expect(ok(f("class A{int x; // note\nint y;}"))).toBe("class A {\n  int x; // note\n  int y;\n}");
  });

  it("keeps block comments and re-indents javadoc continuation lines", () => {
    expect(ok(f("class A{\n/**\n* Doc.\n*/\nvoid f(){}}"))).toBe("class A {\n  /**\n   * Doc.\n   */\n  void f() {\n  }\n}");
  });

  it("preserves a single blank line between members and collapses more", () => {
    expect(ok(f("class A{\nint a;\n\n\n\nint b;}"))).toBe("class A {\n  int a;\n\n  int b;\n}");
  });

  it("indents switch cases and their statements", () => {
    expect(ok(f("void f(){switch(x){case 1:a();break;default:b();}}"))).toBe(
      "void f() {\n  switch(x) {\n    case 1:\n      a();\n      break;\n    default:\n      b();\n  }\n}",
    );
  });

  it("keeps annotations on their own line", () => {
    expect(ok(f("class A{\n@Override\npublic String toString(){return \"x\";}}"))).toBe(
      'class A {\n  @Override\n  public String toString() {\n    return "x";\n  }\n}',
    );
  });

  it("handles package and import lines", () => {
    expect(ok(f("package a.b;import java.util.List;class A{}"))).toBe("package a.b;\nimport java.util.List;\nclass A {\n}");
  });

  it("uses tabs when the unit is a tab", () => {
    expect(ok(f("class A{int x;}", "\t"))).toBe("class A {\n\tint x;\n}");
  });

  it("is idempotent", () => {
    const once = ok(f("class A{void f(){if(a){b();}else{c();}}}"));
    expect(ok(f(once))).toBe(once);
  });

  it("reports an unclosed brace", () => {
    const r = f("class A {");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/unclosed|\{/i);
  });

  it("reports an unmatched closing brace with its position", () => {
    const r = f("class A {}\n}");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.line).toBe(2);
  });

  it("reports an unterminated string", () => {
    expect(f('class A{String s="abc;}').ok).toBe(false);
  });

  it("handles lambdas and anonymous classes with nested braces", () => {
    expect(ok(f("void f(){run(()->{go();});}"))).toBe("void f() {\n  run(()-> {\n    go();\n  });\n}");
  });

  it("handles text blocks as opaque strings", () => {
    const src = 'class A{String s="""\n  a;{\n  """;}';
    expect(ok(f(src))).toBe('class A {\n  String s="""\n  a;{\n  """;\n}');
  });
});
