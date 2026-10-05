import { describe, expect, it } from "vitest";
import { jsonToXml, xmlToJson } from "./xmlJson";

const whole = { selection: false };
const ok = (r: { ok: boolean; text?: string; message?: string }) => {
  if (!r.ok) throw new Error(`expected ok, got: ${r.message}`);
  return r.text!;
};
const json = (r: { ok: boolean; text?: string; message?: string }) => JSON.parse(ok(r));

describe("xmlToJson", () => {
  it("maps attributes, text and children", () => {
    expect(json(xmlToJson('<book id="1"><title>A</title><author>B</author></book>', whole))).toEqual({ book: { "@id": "1", title: "A", author: "B" } });
  });
  it("turns repeated elements into an array and keeps a single one plain", () => {
    expect(json(xmlToJson("<l><i>1</i><i>2</i></l>", whole))).toEqual({ l: { i: ["1", "2"] } });
    expect(json(xmlToJson("<l><i>1</i></l>", whole))).toEqual({ l: { i: "1" } });
  });
  it("keeps text next to attributes under #text", () => {
    expect(json(xmlToJson('<p lang="en">hello</p>', whole))).toEqual({ p: { "@lang": "en", "#text": "hello" } });
  });
  it("turns an empty element into an empty string", () => {
    expect(json(xmlToJson("<a><b/><c></c></a>", whole))).toEqual({ a: { b: "", c: "" } });
  });
  it("decodes entities and takes CDATA as written", () => {
    expect(json(xmlToJson("<a><![CDATA[1 < 2]]> &amp; more</a>", whole))).toEqual({ a: "1 < 2 & more" });
  });
  it("keeps namespace prefixes in names", () => {
    expect(json(xmlToJson('<x:a xmlns:x="u"><x:b/></x:a>', whole))).toEqual({ "x:a": { "@xmlns:x": "u", "x:b": "" } });
  });
  it("converts a selection with several roots to one object", () => {
    expect(json(xmlToJson("<a/><b>1</b><a/>", { selection: true }))).toEqual({ a: ["", ""], b: "1" });
  });
  it("flattens mixed content into #text and says so", () => {
    const r = xmlToJson("<p>Hello <b>big</b> world</p>", whole);
    expect(JSON.parse(ok(r))).toEqual({ p: { "#text": "Hello world", b: "big" } });
    expect(r).toMatchObject({ ok: true, warnings: [expect.stringMatching(/mixed content/)] });
  });
  it("ignores whitespace between child elements without calling it mixed content", () => {
    const r = xmlToJson("<a>\n  <b>1</b>\n  <c>2</c>\n</a>", whole);
    expect(JSON.parse(ok(r))).toEqual({ a: { b: "1", c: "2" } });
    expect(r.ok && r.warnings).toBeFalsy();
  });
  it("drops comments and processing instructions with one notice each", () => {
    const r = xmlToJson('<?xml version="1.0"?><a><!-- x --><?pi y?><b/></a>', whole);
    expect(JSON.parse(ok(r))).toEqual({ a: { b: "" } });
    expect(r).toMatchObject({ ok: true, warnings: ["comments were dropped", "processing instructions were dropped"] });
  });
  it("does not mention the XML declaration", () => {
    const r = xmlToJson('<?xml version="1.0"?><a/>', whole);
    expect(r.ok && r.warnings).toBeFalsy();
  });
  it("keeps the order of attributes then children", () => {
    const out = ok(xmlToJson('<a z="1" y="2"><k/><j/></a>', whole));
    expect(out.indexOf('"@z"')).toBeLessThan(out.indexOf('"@y"'));
    expect(out.indexOf('"k"')).toBeLessThan(out.indexOf('"j"'));
  });
  it("prints with a 2-space indent", () => {
    expect(ok(xmlToJson("<a><b>1</b></a>", whole))).toBe('{\n  "a": {\n    "b": "1"\n  }\n}');
  });
  it("reports invalid XML with its position", () => {
    expect(xmlToJson("<a><b></a>", whole)).toMatchObject({ ok: false, line: 1 });
  });
});

describe("jsonToXml", () => {
  const xml = async (src: string) => ok(await jsonToXml(src, whole));

  it("uses a single non-array key as the root", async () => {
    expect(await xml('{"book": {"@id": "1", "title": "A"}}')).toBe('<book id="1">\n  <title>A</title>\n</book>');
  });
  it("wraps several keys in <root>", async () => {
    expect(await xml('{"a": 1, "b": 2}')).toBe("<root>\n  <a>1</a>\n  <b>2</b>\n</root>");
  });
  it("wraps a single key whose value is an array", async () => {
    expect(await xml('{"l": [1, 2]}')).toBe("<root>\n  <l>1</l>\n  <l>2</l>\n</root>");
  });
  it("repeats elements for arrays", async () => {
    expect(await xml('{"l": {"i": ["1", "2"]}}')).toBe("<l>\n  <i>1</i>\n  <i>2</i>\n</l>");
  });
  it("wraps a top-level array's items", async () => {
    expect(await xml("[1, 2]")).toBe("<root>\n  <item>1</item>\n  <item>2</item>\n</root>");
  });
  it("wraps a top-level scalar", async () => {
    expect(await xml('"hi"')).toBe("<root>hi</root>");
  });
  it("escapes text and attribute values", async () => {
    expect(await xml('{"a": "1 < 2 & 3"}')).toBe("<a>1 &lt; 2 &amp; 3</a>");
    expect(await xml('{"a": {"@t": "say \\"hi\\" & <go>"}}')).toBe('<a t="say &quot;hi&quot; &amp; &lt;go>"/>');
  });
  it("writes null and empty strings as empty elements and booleans as text", async () => {
    expect(await xml('{"r": {"n": null, "e": "", "t": true}}')).toBe("<r>\n  <n/>\n  <e/>\n  <t>true</t>\n</r>");
  });
  it("puts #text before children", async () => {
    expect(await xml('{"p": {"#text": "Hello", "b": "big"}}')).toBe("<p>\n  Hello\n  <b>big</b>\n</p>");
  });
  it("keeps large integers' digits", async () => {
    expect(await xml('{"id": 12345678901234567890}')).toBe("<id>12345678901234567890</id>");
  });
  it("names the path of an invalid element name", async () => {
    expect(await jsonToXml('{"r": {"not valid": 1}}', whole)).toMatchObject({ ok: false, message: "r.not valid is not a valid XML name" });
  });
  it("rejects an invalid attribute name and a non-scalar attribute", async () => {
    expect(await jsonToXml('{"r": {"@a b": 1}}', whole)).toMatchObject({ ok: false });
    expect(await jsonToXml('{"r": {"@a": {"x": 1}}}', whole)).toMatchObject({ ok: false });
  });
  it("rejects arrays inside arrays", async () => {
    expect(await jsonToXml('{"r": {"a": [[1]]}}', whole)).toMatchObject({ ok: false, message: expect.stringMatching(/array inside an array/) });
  });
  it("reports invalid JSON with its position", async () => {
    expect(await jsonToXml('{"a": }', whole)).toMatchObject({ ok: false, line: 1, column: 7 });
  });
  it("keeps the source's trailing newline", async () => {
    expect((await xml('{"a": 1}\n')).endsWith("\n")).toBe(true);
  });
});

describe("round trip", () => {
  it("XML to JSON to XML keeps elements, attributes and text when there is no mixed content", async () => {
    const src = '<lib name="main"><book id="1"><title>A &amp; B</title></book><book id="2"><title>C</title></book><note/></lib>';
    const back = ok(await jsonToXml(ok(xmlToJson(src, whole)), whole));
    // Compare structure through JSON again: the same data comes out.
    expect(JSON.parse(ok(xmlToJson(back, whole)))).toEqual(JSON.parse(ok(xmlToJson(src, whole))));
    expect(back).toContain('<lib name="main">');
    expect(back).toContain("<title>A &amp; B</title>");
    expect(back.match(/<book /g)).toHaveLength(2);
    expect(back).toContain("<note/>");
  });
});
