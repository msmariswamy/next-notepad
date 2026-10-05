import { describe, expect, it } from "vitest";
import { formatMarkup } from "./markup";

const xml = (s: string, unit = "  ") => formatMarkup(s, { unit, html: false });
const html = (s: string, unit = "  ") => formatMarkup(s, { unit, html: true });
const ok = (r: ReturnType<typeof formatMarkup>) => (r.ok ? r.text : `ERROR ${r.message}`);

describe("XML", () => {
  it("nests elements with indentation and keeps text-only elements on one line", () => {
    expect(ok(xml("<a><b>1</b><c/></a>"))).toBe("<a>\n  <b>1</b>\n  <c/>\n</a>");
  });

  it("keeps the XML declaration and attributes", () => {
    expect(ok(xml('<?xml version="1.0"?><root id="1"><a x="2"/></root>'))).toBe('<?xml version="1.0"?>\n<root id="1">\n  <a x="2"/>\n</root>');
  });

  it("is idempotent", () => {
    const once = ok(xml("<a><b><c>t</c></b></a>"));
    expect(ok(xml(once))).toBe(once);
  });

  it("re-indents already indented input consistently", () => {
    expect(ok(xml("<a>\n      <b>1</b>\n<c>\n   <d/></c>\n</a>"))).toBe("<a>\n  <b>1</b>\n  <c>\n    <d/>\n  </c>\n</a>");
  });

  it("keeps comments, CDATA and processing instructions", () => {
    expect(ok(xml("<a><!-- note --><![CDATA[x < y]]><?pi data?></a>"))).toBe("<a>\n  <!-- note -->\n  <![CDATA[x < y]]>\n  <?pi data?>\n</a>");
  });

  it("collapses whitespace inside text but keeps the words", () => {
    expect(ok(xml("<a>  hello \n   world  </a>"))).toBe("<a>hello world</a>");
  });

  it("uses tabs when the unit is a tab", () => {
    expect(ok(xml("<a><b/></a>", "\t"))).toBe("<a>\n\t<b/>\n</a>");
  });

  it("keeps attribute values containing > intact", () => {
    expect(ok(xml('<a t="x>y"><b/></a>'))).toBe('<a t="x>y">\n  <b/>\n</a>');
  });

  it("reports a mismatched closing tag with its line and column", () => {
    const r = xml("<a>\n  <b></c>\n</a>");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.line).toBe(2);
      expect(r.message).toMatch(/<\/c>/);
    }
  });

  it("reports an unclosed element", () => {
    const r = xml("<a><b>");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/unclosed|not closed/i);
  });

  it("reports a closing tag with no opening tag", () => {
    expect(xml("</a>").ok).toBe(false);
  });
});

describe("HTML", () => {
  it("puts each element on its own indented line", () => {
    expect(ok(html("<div><p>Hi</p></div>"))).toBe("<div>\n  <p>Hi</p>\n</div>");
  });

  it("handles a full document and the doctype", () => {
    expect(ok(html("<!DOCTYPE html><html><head><title>T</title></head><body><p>x</p></body></html>"))).toBe(
      "<!DOCTYPE html>\n<html>\n  <head>\n    <title>T</title>\n  </head>\n  <body>\n    <p>x</p>\n  </body>\n</html>",
    );
  });

  it("does not expect closing tags for void elements", () => {
    expect(ok(html("<div><br><img src=a.png><input type=text></div>"))).toBe("<div>\n  <br>\n  <img src=a.png>\n  <input type=text>\n</div>");
  });

  it("accepts omitted closing tags for li and p", () => {
    expect(html("<ul><li>a<li>b</ul>").ok).toBe(true);
  });

  it("keeps pre blocks verbatim", () => {
    expect(ok(html("<div><pre>  a\n    b</pre></div>"))).toBe("<div>\n  <pre>  a\n    b</pre>\n</div>");
  });

  it("keeps script and style bodies untouched", () => {
    expect(ok(html("<head><script>if (a<b) {x()}</script></head>"))).toBe("<head>\n  <script>if (a<b) {x()}</script>\n</head>");
  });

  it("is case-insensitive about tag names", () => {
    expect(ok(html("<DIV><BR></DIV>"))).toBe("<DIV>\n  <BR>\n</DIV>");
  });

  it("reports a wrongly nested closing tag", () => {
    expect(html("<div><span></div></span>").ok).toBe(false);
  });

  it("is idempotent", () => {
    const once = ok(html("<div><ul><li>a</li><li>b</li></ul></div>"));
    expect(ok(html(once))).toBe(once);
  });
});
