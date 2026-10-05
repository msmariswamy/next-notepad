import { describe, expect, it } from "vitest";
import { XML_ERROR_MAX_CHARS, xmlErrorRange } from "./errors";
import { compactXml, escapeXml, escapeXmlTool, formatXml, sortXmlAttributes, unescapeXml, unescapeXmlTool, validateXmlTool } from "./tools";

const ok = (r: { ok: boolean; text?: string; message?: string }) => {
  if (!r.ok) throw new Error(`expected ok, got: ${(r as { message: string }).message}`);
  return (r as { text: string }).text;
};

describe("xmlErrorRange", () => {
  it("underlines the character at the first error", () => {
    expect(xmlErrorRange("<a><b></a>")).toEqual({ from: 6, to: 7 });
  });
  it("underlines the last character when the error is at the very end", () => {
    const text = "<a><b>";
    expect(xmlErrorRange(text)).toEqual({ from: 3, to: 4 }); // the innermost unclosed tag, <b>
    expect(xmlErrorRange("<a x=\"1")).toEqual({ from: 5, to: 6 });
  });
  it("is null for valid, empty and blank text", () => {
    expect(xmlErrorRange("<a/>")).toBeNull();
    expect(xmlErrorRange("")).toBeNull();
    expect(xmlErrorRange("  \n ")).toBeNull();
  });
  it("is null above the size limit", () => {
    expect(XML_ERROR_MAX_CHARS).toBe(1_000_000);
    expect(xmlErrorRange("<a>" + "x".repeat(XML_ERROR_MAX_CHARS))).toBeNull();
  });
});

describe("validateXmlTool", () => {
  it("says the XML is valid", () => {
    expect(validateXmlTool("<a/>", { selection: false })).toMatchObject({ ok: true, message: "XML is valid" });
  });
  it("reports line and column", () => {
    expect(validateXmlTool("<a>\n<b></a>", { selection: false })).toMatchObject({ ok: false, line: 2 });
  });
  it("accepts several roots only for a selection", () => {
    expect(validateXmlTool("<a/><b/>", { selection: true }).ok).toBe(true);
    const r = validateXmlTool("<a/><b/>", { selection: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/only one root/i);
  });
});

describe("compactXml", () => {
  const compact = (t: string) => ok(compactXml(t, { selection: false }));

  it("removes indentation and line breaks between tags", () => {
    expect(compact("<a>\n  <b>x</b>\n  <c/>\n</a>")).toBe("<a><b>x</b><c/></a>");
  });
  it("removes whitespace around the prolog and after the root", () => {
    expect(compact('<?xml version="1.0"?>\n<a/>\n')).toBe('<?xml version="1.0"?><a/>');
  });
  it("keeps text content exactly", () => {
    expect(compact("<a>  hello  <b/> world </a>")).toBe("<a>  hello  <b/> world </a>");
  });
  it("keeps comments, CDATA and processing instructions", () => {
    const src = "<a>\n  <!-- note -->\n  <![CDATA[ <x> ]]>\n  <?pi data?>\n</a>";
    expect(compact(src)).toBe("<a><!-- note --><![CDATA[ <x> ]]><?pi data?></a>");
  });
  it("leaves xml:space=preserve content alone, including nested elements", () => {
    expect(compact('<a xml:space="preserve">\n  <b>\n    <c/>\n  </b>\n</a>')).toBe('<a xml:space="preserve">\n  <b>\n    <c/>\n  </b>\n</a>');
  });
  it("xml:space=default turns compacting back on inside a preserved element", () => {
    expect(compact('<a xml:space="preserve"> <b xml:space="default"> <c/> </b> </a>')).toBe('<a xml:space="preserve"> <b xml:space="default"><c/></b> </a>');
  });
  it("does not change attributes", () => {
    expect(compact("<a  x = 'it\"s'\n   y=\"2\" >\n</a>")).toBe("<a  x = 'it\"s'\n   y=\"2\" ></a>");
  });
  it("refuses invalid XML with its position", () => {
    expect(compactXml("<a><b></a>", { selection: false })).toMatchObject({ ok: false, line: 1 });
  });
  it("compacts a fragment selection with several roots", () => {
    expect(ok(compactXml("<a> <b/> </a>\n<c/>", { selection: true }))).toBe("<a><b/></a><c/>");
  });
  it("is idempotent", () => {
    const once = compact("<a>\n <b>\n  <c/>\n </b>\n</a>");
    expect(compact(once)).toBe(once);
  });
});

describe("sortXmlAttributes", () => {
  const sort = (t: string) => ok(sortXmlAttributes(t, { selection: false }));

  it("sorts attributes ordinally and keeps their quoting", () => {
    expect(sort(`<a z="1" b='2' a="3"/>`)).toBe(`<a a="3" b='2' z="1"/>`);
  });
  it("sorts in every element and never reorders elements", () => {
    expect(sort(`<r><z b="1" a="2"/><a d="1" c="2"></a></r>`)).toBe(`<r><z a="2" b="1"/><a c="2" d="1"></a></r>`);
  });
  it("is case-sensitive ordinal: uppercase sorts before lowercase", () => {
    expect(sort(`<a b="1" B="2" a="3"/>`)).toBe(`<a B="2" a="3" b="1"/>`);
  });
  it("sorts namespace declarations with the rest", () => {
    expect(sort(`<a xmlns:x="u" id="1"/>`)).toBe(`<a id="1" xmlns:x="u"/>`);
  });
  it("leaves already sorted tags byte-for-byte untouched, including odd spacing", () => {
    const src = `<a  a = "1"\n   b="2"   >\n</a>`;
    expect(sort(src)).toBe(src);
  });
  it("keeps text, comments and everything else as is", () => {
    const src = `<a z="1" a="2">\n  text <!-- c --> &amp; <![CDATA[x]]>\n</a>`;
    expect(sort(src)).toBe(`<a a="2" z="1">\n  text <!-- c --> &amp; <![CDATA[x]]>\n</a>`);
  });
  it("refuses invalid XML", () => {
    expect(sortXmlAttributes(`<a x="1" x="2"/>`, { selection: false }).ok).toBe(false);
  });
});

describe("escapeXml and unescapeXml", () => {
  it("escapes the five characters", () => {
    expect(escapeXml(`a < b && "c" 'd' >`)).toBe("a &lt; b &amp;&amp; &quot;c&quot; &apos;d&apos; &gt;");
  });
  it("unescapes the five entities and numeric references", () => {
    expect(unescapeXml("&lt;a&gt; &#65; &#x42; &amp;amp; &quot;&apos;")).toBe(`<a> A B &amp; "'`);
  });
  it("leaves unknown entities and invalid references as written", () => {
    expect(unescapeXml("&unknown; &#0; &#xFFFFFFF; & plain")).toBe("&unknown; &#0; &#xFFFFFFF; & plain");
  });
  it("unescape reverses exactly one level", () => {
    expect(unescapeXml("&amp;lt;")).toBe("&lt;");
  });
  it("round-trips any text", () => {
    const text = `<a href="x?y=1&z=2">it's</a> & more`;
    expect(unescapeXml(escapeXml(text))).toBe(text);
  });
  it("the Escape and Unescape tools wrap them", () => {
    expect(ok(escapeXmlTool("<", { selection: false }))).toBe("&lt;");
    expect(ok(unescapeXmlTool("&lt;", { selection: false }))).toBe("<");
  });
});

describe("formatXml", () => {
  it("formats with 2 spaces, 4 spaces or a tab", () => {
    expect(ok(formatXml("<a><b>x</b></a>", "  ", { selection: false }))).toBe("<a>\n  <b>x</b>\n</a>");
    expect(ok(formatXml("<a><b>x</b></a>", "    ", { selection: false }))).toBe("<a>\n    <b>x</b>\n</a>");
    expect(ok(formatXml("<a><b>x</b></a>", "\t", { selection: false }))).toBe("<a>\n\t<b>x</b>\n</a>");
  });
  it("validates first and reports a position instead of guessing", () => {
    expect(formatXml("<a><b></a>", "  ", { selection: false })).toMatchObject({ ok: false, line: 1 });
  });
  it("gives the same text as Format Document's engine", async () => {
    const { formatCode } = await import("../format/format");
    const src = '<a x="1"><b>text</b><c/></a>';
    const viaDocument = await formatCode("XML", src, { tabWidth: 2, useTabs: false });
    expect(viaDocument.ok).toBe(true);
    expect(ok(formatXml(src, "  ", { selection: false }))).toBe((viaDocument as { text: string }).text);
  });
});
