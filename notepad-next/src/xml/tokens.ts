/**
 * A small strict XML tokenizer and well-formedness checker (design D2). It does not use DOMParser, whose error
 * text and positions differ between WebKit, WebView2 and jsdom. Every token keeps its raw text and offsets, so
 * Compact and Sort Attributes can rewrite only what they mean to change and copy everything else verbatim.
 */

export interface XmlAttr {
  name: string;
  /** The value without its quotes, entities not decoded. */
  value: string;
  /** The attribute exactly as written, for example `b='two words'`. */
  raw: string;
}

interface Base {
  from: number;
  to: number;
  raw: string;
}

export type XmlToken =
  | (Base & { kind: "open"; name: string; attrs: XmlAttr[] })
  | (Base & { kind: "selfclose"; name: string; attrs: XmlAttr[] })
  | (Base & { kind: "close"; name: string })
  | (Base & { kind: "text" })
  | (Base & { kind: "comment" | "cdata" | "pi" | "doctype" });

export interface XmlError {
  ok: false;
  message: string;
  offset: number;
  line: number;
  column: number;
}

export type TokenizeResult = { ok: true; tokens: XmlToken[]; hasDoctype: boolean } | XmlError;

export function positionOf(text: string, offset: number): { line: number; column: number } {
  const upTo = text.slice(0, Math.min(offset, text.length));
  const line = upTo.split("\n").length;
  return { line, column: upTo.length - (upTo.lastIndexOf("\n") + 1) + 1 };
}

const NAME_START = /[A-Za-z_:À-￿]/;
const NAME_CHAR = /[A-Za-z0-9_:.\-·À-￿]/;
const PREDEFINED = new Set(["lt", "gt", "amp", "quot", "apos"]);

class Failure extends Error {
  constructor(
    message: string,
    public offset: number,
  ) {
    super(message);
  }
}

/** Check the `&...;` references in a stretch of text or an attribute value. */
function checkReferences(src: string, from: number, to: number, doctype: boolean): void {
  for (let i = from; i < to; i++) {
    if (src[i] !== "&") continue;
    const semi = src.indexOf(";", i);
    const body = semi > 0 && semi < to ? src.slice(i + 1, semi) : null;
    if (body !== null && (/^#\d+$/.test(body) || /^#x[0-9a-fA-F]+$/.test(body) || PREDEFINED.has(body))) {
      i = semi;
      continue;
    }
    if (body !== null && /^[A-Za-z_:][\w:.-]*$/.test(body)) {
      // A named entity: unknown unless the document type declaration may define it.
      if (doctype) {
        i = semi;
        continue;
      }
      throw new Failure(`Unknown entity &${body}; (use &amp; for a literal &)`, i);
    }
    throw new Failure("Invalid '&': write &amp; for a literal ampersand", i);
  }
}

export function tokenizeXml(src: string): TokenizeResult {
  const tokens: XmlToken[] = [];
  let hasDoctype = false;
  let i = 0;
  const fail = (e: Failure): XmlError => ({ ok: false, message: e.message, offset: e.offset, ...positionOf(src, e.offset) });

  const readName = (at: number): string => {
    if (!NAME_START.test(src[at] ?? "")) throw new Failure("Expected a tag name", at);
    let j = at + 1;
    while (j < src.length && NAME_CHAR.test(src[j])) j++;
    return src.slice(at, j);
  };

  const skipWs = (at: number): number => {
    while (at < src.length && /\s/.test(src[at])) at++;
    return at;
  };

  try {
    while (i < src.length) {
      if (src[i] !== "<") {
        const next = src.indexOf("<", i);
        const end = next < 0 ? src.length : next;
        checkReferences(src, i, end, hasDoctype);
        tokens.push({ kind: "text", from: i, to: end, raw: src.slice(i, end) });
        i = end;
        continue;
      }
      const start = i;
      const push = (kind: "comment" | "cdata" | "pi" | "doctype", end: number) => {
        tokens.push({ kind, from: start, to: end, raw: src.slice(start, end) });
        i = end;
      };
      if (src.startsWith("<!--", i)) {
        const end = src.indexOf("-->", i + 4);
        if (end < 0) throw new Failure("Unterminated comment", i);
        push("comment", end + 3);
      } else if (src.startsWith("<![CDATA[", i)) {
        const end = src.indexOf("]]>", i + 9);
        if (end < 0) throw new Failure("Unterminated CDATA section", i);
        push("cdata", end + 3);
      } else if (src.startsWith("<?", i)) {
        const end = src.indexOf("?>", i + 2);
        if (end < 0) throw new Failure("Unterminated processing instruction", i);
        push("pi", end + 2);
      } else if (src.startsWith("<!", i)) {
        // <!DOCTYPE ...>, possibly with an internal subset in [...] that itself contains > characters.
        let j = i + 2;
        let depth = 0;
        for (; j < src.length; j++) {
          if (src[j] === "[") depth++;
          else if (src[j] === "]") depth--;
          else if (src[j] === ">" && depth <= 0) break;
        }
        if (j >= src.length) throw new Failure("Unterminated declaration", i);
        hasDoctype = true;
        push("doctype", j + 1);
      } else if (src[i + 1] === "/") {
        const name = readName(i + 2);
        const j = skipWs(i + 2 + name.length);
        if (src[j] !== ">") throw new Failure("Unterminated tag: expected >", j >= src.length ? i : j);
        tokens.push({ kind: "close", name, from: i, to: j + 1, raw: src.slice(i, j + 1) });
        i = j + 1;
      } else {
        const name = readName(i + 1);
        let j = i + 1 + name.length;
        const attrs: XmlAttr[] = [];
        const seen = new Set<string>();
        for (;;) {
          const afterWs = skipWs(j);
          if (afterWs >= src.length) throw new Failure("Unterminated tag", i);
          if (src[afterWs] === ">" || src.startsWith("/>", afterWs)) {
            const selfClose = src[afterWs] === "/";
            const end = afterWs + (selfClose ? 2 : 1);
            tokens.push(
              selfClose
                ? { kind: "selfclose", name, attrs, from: i, to: end, raw: src.slice(i, end) }
                : { kind: "open", name, attrs, from: i, to: end, raw: src.slice(i, end) },
            );
            i = end;
            break;
          }
          if (afterWs === j) throw new Failure("Expected whitespace before the attribute", afterWs);
          const attrStart = afterWs;
          const attrName = readName(attrStart);
          let k = skipWs(attrStart + attrName.length);
          if (src[k] !== "=") throw new Failure(`Attribute ${attrName} needs a value: expected =`, k >= src.length ? attrStart : k);
          k = skipWs(k + 1);
          const quote = src[k];
          if (quote !== '"' && quote !== "'") throw new Failure("Attribute values must be quoted", k);
          const close = src.indexOf(quote, k + 1);
          if (close < 0) throw new Failure("Unterminated attribute value", k);
          const value = src.slice(k + 1, close);
          if (value.includes("<")) throw new Failure("< is not allowed in an attribute value (use &lt;)", k + 1 + value.indexOf("<"));
          checkReferences(src, k + 1, close, hasDoctype);
          if (seen.has(attrName)) throw new Failure(`Duplicate attribute ${attrName}`, attrStart);
          seen.add(attrName);
          attrs.push({ name: attrName, value, raw: src.slice(attrStart, close + 1) });
          j = close + 1;
        }
      }
    }
  } catch (e) {
    if (e instanceof Failure) return fail(e);
    throw e;
  }
  return { ok: true, tokens, hasDoctype };
}

export type ValidateResult = { ok: true } | XmlError;

/**
 * Well-formedness: balanced and matching tags and, unless `fragment` is set, exactly one root element with only
 * whitespace and comments around it. A fragment (a selection) may have several roots and loose text.
 */
export function validateXml(text: string, opts: { fragment?: boolean } = {}): ValidateResult {
  const t = tokenizeXml(text);
  if (!t.ok) return t;
  const err = (message: string, offset: number): XmlError => ({ ok: false, message, offset, ...positionOf(text, offset) });
  const stack: { name: string; at: number }[] = [];
  let roots = 0;
  for (const tok of t.tokens) {
    switch (tok.kind) {
      case "open":
      case "selfclose":
        if (stack.length === 0) {
          roots++;
          if (roots > 1 && !opts.fragment) return err("Only one root element is allowed", tok.from);
        }
        if (tok.kind === "open") stack.push({ name: tok.name, at: tok.from });
        break;
      case "close": {
        const top = stack.pop();
        if (!top) return err(`Closing tag </${tok.name}> has no open tag`, tok.from);
        if (top.name !== tok.name) return err(`Mismatched closing tag </${tok.name}>, expected </${top.name}>`, tok.from);
        break;
      }
      case "text":
        if (stack.length === 0 && !opts.fragment && tok.raw.trim() !== "") return err("Text is not allowed outside the root element", tok.from + (tok.raw.length - tok.raw.trimStart().length));
        break;
      case "cdata":
        if (stack.length === 0 && !opts.fragment) return err("CDATA is not allowed outside the root element", tok.from);
        break;
      default:
        break;
    }
  }
  const unclosed = stack[stack.length - 1];
  if (unclosed) return err(`Unclosed tag <${unclosed.name}>`, unclosed.at);
  if (roots === 0 && !opts.fragment) return err("No root element", 0);
  return { ok: true };
}
