import { describe, expect, it } from "vitest";
import { positionOf, tokenizeXml, validateXml } from "./tokens";

describe("positionOf", () => {
  it("is 1-based line and column", () => {
    expect(positionOf("ab\ncd", 0)).toEqual({ line: 1, column: 1 });
    expect(positionOf("ab\ncd", 4)).toEqual({ line: 2, column: 2 });
    expect(positionOf("ab\ncd", 99)).toEqual({ line: 2, column: 3 });
  });
});

describe("tokenizeXml", () => {
  const kinds = (text: string) => {
    const r = tokenizeXml(text);
    if (!r.ok) throw new Error(r.message);
    return r.tokens.map((t) => t.kind);
  };

  it("splits tags, text, comments, CDATA, processing instructions and doctype", () => {
    expect(kinds('<?xml version="1.0"?><!DOCTYPE a><a>t<!-- c --><![CDATA[x]]><b/></a>')).toEqual([
      "pi",
      "doctype",
      "open",
      "text",
      "comment",
      "cdata",
      "selfclose",
      "close",
    ]);
  });

  it("every token's raw text is its slice of the source and tokens cover the whole input", () => {
    const text = '<a x="1" y=\'2\'>\n  <b/>hi &amp; bye<!--c--></a>\n';
    const r = tokenizeXml(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tokens.map((t) => t.raw).join("")).toBe(text);
    for (const t of r.tokens) expect(text.slice(t.from, t.to)).toBe(t.raw);
  });

  it("reads attributes with their quoting and raw text", () => {
    const r = tokenizeXml(`<a z="1" b='two words'/>`);
    if (!r.ok) throw new Error(r.message);
    const tag = r.tokens[0];
    expect(tag.kind).toBe("selfclose");
    if (tag.kind !== "selfclose") return;
    expect(tag.name).toBe("a");
    expect(tag.attrs.map((a) => [a.name, a.value, a.raw])).toEqual([
      ["z", "1", 'z="1"'],
      ["b", "two words", "b='two words'"],
    ]);
  });

  it("allows whitespace around = and before the closing bracket", () => {
    expect(kinds('<a  x = "1"  >')).toEqual(["open"]);
    expect(kinds("<a/ >".replace("/ >", "/>"))).toEqual(["selfclose"]);
    expect(kinds("</a >")).toEqual(["close"]);
  });

  it("allows > inside attribute values and comments", () => {
    expect(kinds('<a x="1>2"><!-- > --></a>')).toEqual(["open", "comment", "close"]);
  });

  it("allows a doctype with an internal subset", () => {
    expect(kinds('<!DOCTYPE a [<!ENTITY e "v">]><a>&e;</a>')).toEqual(["doctype", "open", "text", "close"]);
  });

  it("accepts numeric and predefined character references", () => {
    expect(kinds("<a>&lt;&gt;&amp;&quot;&apos;&#65;&#x41;</a>")).toEqual(["open", "text", "close"]);
  });
});

describe("tokenizeXml errors", () => {
  const err = (text: string) => {
    const r = tokenizeXml(text);
    if (r.ok) throw new Error("expected an error");
    return r;
  };

  it.each([
    ["<a x=1/>", /quote/i, 1, 6],
    ["<a x/>", /=/, 1, 5],
    ['<a x="1" x="2"/>', /duplicate attribute/i, 1, 10],
    ["<a>fish & chips</a>", /&/, 1, 9],
    ["<a>&nope;</a>", /unknown entity/i, 1, 4],
    ["<a>&#xZZ;</a>", /&/, 1, 4],
    ["<a><!-- open", /unterminated comment/i, 1, 4],
    ["<a><![CDATA[ x", /unterminated cdata/i, 1, 4],
    ["<?xml version", /unterminated processing/i, 1, 1],
    ['<a x="1', /unterminated/i, 1, 6],
    ["<a", /unterminated tag/i, 1, 1],
    ["< a/>", /tag name/i, 1, 2],
    ["<a x='<'/>", /< is not allowed/i, 1, 7],
    ["</>", /tag name/i, 1, 3],
    ["<a>\n\n<1b/></a>", /tag name/i, 3, 2],
  ])("%s", (text, message, line, column) => {
    const e = err(text);
    expect(e.message).toMatch(message);
    expect({ line: e.line, column: e.column }).toEqual({ line, column });
  });

  it("an unknown entity is allowed when a doctype may define it", () => {
    expect(tokenizeXml('<!DOCTYPE a [<!ENTITY e "v">]><a>&e;</a>').ok).toBe(true);
  });
});

describe("validateXml", () => {
  const ok = (text: string, fragment = false) => expect(validateXml(text, { fragment })).toEqual({ ok: true });
  const bad = (text: string, message: RegExp, line: number, fragment = false) => {
    const r = validateXml(text, { fragment });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toMatch(message);
    expect(r.line).toBe(line);
  };

  it("accepts well-formed documents", () => {
    ok('<?xml version="1.0"?>\n<!-- c -->\n<a x="1"><b/><c>t</c></a>\n');
    ok("<a/>");
  });

  it("reports a mismatched closing tag on its line", () => bad("<a>\n<b></a>", /mismatched.*<\/a>.*<\/b>/i, 2));

  it("reports an unclosed tag at the tag that was never closed", () => bad("<a>\n<b>\n</b>", /unclosed.*<a>/i, 1));

  it("reports a closing tag with nothing open", () => bad("</a>", /no open/i, 1));

  it("reports text outside the root", () => {
    bad("hello<a/>", /outside the root/i, 1);
    bad("<a/>\ntrailing", /outside the root/i, 2);
  });

  it("reports several roots for a whole document", () => bad("<a/>\n<b/>", /only one root/i, 2));

  it("reports no root", () => {
    bad("   ", /no root/i, 1);
    bad("<!-- only a comment -->", /no root/i, 1);
  });

  it("allows several roots and loose text in a fragment", () => {
    ok("<a/><b/>", true);
    ok("text <a/> more <b/>", true);
  });

  it("still requires balanced tags in a fragment", () => bad("<a><b/>", /unclosed/i, 1, true));

  it("passes tokenizer errors through", () => bad("<a x=1/>", /quote/i, 1));
});
