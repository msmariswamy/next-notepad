import { formatMarkup } from "../format/markup";
import type { ToolContext, ToolResult } from "../tools/runTool";
import { positionOf, tokenizeXml, validateXml, type XmlAttr, type XmlToken } from "./tokens";

/** Tokenize and validate; a selection may be a fragment with several roots. */
function parse(text: string, ctx: ToolContext): { ok: true; tokens: XmlToken[] } | Extract<ToolResult, { ok: false }> {
  const valid = validateXml(text, { fragment: ctx.selection });
  if (!valid.ok) return { ok: false, message: valid.message, line: valid.line, column: valid.column, offset: valid.offset };
  const t = tokenizeXml(text);
  // validateXml already tokenized successfully, so this cannot fail; the check keeps the types honest.
  if (!t.ok) return { ok: false, message: t.message, line: t.line, column: t.column, offset: t.offset };
  return { ok: true, tokens: t.tokens };
}

export function validateXmlTool(text: string, ctx: ToolContext): ToolResult {
  const r = validateXml(text, { fragment: ctx.selection });
  return r.ok ? { ok: true, text, message: "XML is valid" } : { ok: false, message: r.message, line: r.line, column: r.column, offset: r.offset };
}

/** XML whitespace is only space, tab, CR and LF (JavaScript's \s also matches things like NBSP). */
const BLANK = /^[ \t\r\n]*$/;

function preserves(attrs: XmlAttr[], inherited: boolean): boolean {
  const space = attrs.find((a) => a.name === "xml:space")?.value;
  return space === "preserve" ? true : space === "default" ? false : inherited;
}

/**
 * Remove whitespace-only text between tags, comments and processing instructions. Text with any content, comments,
 * CDATA, processing instructions and attributes are copied untouched; `xml:space="preserve"` content is left alone.
 */
export function compactXml(text: string, ctx: ToolContext): ToolResult {
  const p = parse(text, ctx);
  if (!p.ok) return p;
  const preserve: boolean[] = [];
  const now = () => preserve[preserve.length - 1] ?? false;
  let out = "";
  for (const tok of p.tokens) {
    if (tok.kind === "open") {
      out += tok.raw;
      preserve.push(preserves(tok.attrs, now()));
    } else if (tok.kind === "close") {
      preserve.pop();
      out += tok.raw;
    } else if (tok.kind === "text" && BLANK.test(tok.raw) && !now()) {
      continue;
    } else {
      out += tok.raw;
    }
  }
  return { ok: true, text: out };
}

const byName = (a: XmlAttr, b: XmlAttr) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/**
 * Order the attributes of every element by name (ordinal, case-sensitive). Each attribute keeps its text and quoting,
 * element order never changes, and a tag whose attributes are already in order is copied byte for byte.
 */
export function sortXmlAttributes(text: string, ctx: ToolContext): ToolResult {
  const p = parse(text, ctx);
  if (!p.ok) return p;
  let out = "";
  for (const tok of p.tokens) {
    if ((tok.kind === "open" || tok.kind === "selfclose") && tok.attrs.length > 1) {
      const sorted = [...tok.attrs].sort(byName);
      if (sorted.some((a, i) => a !== tok.attrs[i])) {
        out += `<${tok.name} ${sorted.map((a) => a.raw).join(" ")}${tok.kind === "selfclose" ? "/>" : ">"}`;
        continue;
      }
    }
    out += tok.raw;
  }
  return { ok: true, text: out };
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

export const escapeXml = (text: string): string => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

const validCodePoint = (n: number) =>
  n === 0x9 || n === 0xa || n === 0xd || (n >= 0x20 && n <= 0xd7ff) || (n >= 0xe000 && n <= 0xfffd) || (n >= 0x10000 && n <= 0x10ffff);

/** Reverse one level of the five entities and numeric references; anything else is left as written. */
export const unescapeXml = (text: string): string =>
  text.replace(/&(lt|gt|amp|quot|apos);|&#(\d+);|&#x([0-9a-fA-F]+);/g, (m, name?: string, dec?: string, hex?: string) => {
    if (name) return ENTITIES[name];
    const n = dec !== undefined ? Number(dec) : parseInt(hex!, 16);
    return validCodePoint(n) ? String.fromCodePoint(n) : m;
  });

export const escapeXmlTool = (text: string, _ctx: ToolContext): ToolResult => ({ ok: true, text: escapeXml(text) });
export const unescapeXmlTool = (text: string, _ctx: ToolContext): ToolResult => ({ ok: true, text: unescapeXml(text) });

/** Format with the same engine as Format Document, after checking well-formedness so errors carry a position. */
export function formatXml(text: string, unit: string, ctx: ToolContext): ToolResult {
  const p = parse(text, ctx);
  if (!p.ok) return p;
  const r = formatMarkup(text, { unit, html: false });
  return r.ok ? { ok: true, text: r.text } : { ok: false, message: r.message, line: r.line, column: r.column };
}

export { positionOf };
