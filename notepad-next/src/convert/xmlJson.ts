import type { ToolContext, ToolResult } from "../tools/runTool";
import { escapeXml, unescapeXml } from "../xml/tools";
import { tokenizeXml, validateXml, type XmlAttr } from "../xml/tokens";
import { isMap, readJson, withSourceNewline } from "./json";
import { Obj, print, type Json } from "./jsonOut";

interface El {
  name: string;
  attrs: XmlAttr[];
  kids: Kid[];
}
type Kid = El | { text: string };
const isEl = (k: Kid): k is El => "name" in k;

interface Notes {
  comments: boolean;
  instructions: boolean;
  mixed: boolean;
  looseText: boolean;
}

/** Build the element tree from validated tokens; text is entity-decoded and CDATA is taken as written. */
function buildTree(tokens: ReturnType<typeof tokenizeXml> & { ok: true }, notes: Notes): Kid[] {
  const top: Kid[] = [];
  const stack: El[] = [];
  const add = (k: Kid) => (stack.length > 0 ? stack[stack.length - 1].kids : top).push(k);
  for (const t of tokens.tokens) {
    switch (t.kind) {
      case "open":
      case "selfclose": {
        const el: El = { name: t.name, attrs: t.attrs, kids: [] };
        add(el);
        if (t.kind === "open") stack.push(el);
        break;
      }
      case "close":
        stack.pop();
        break;
      case "text":
        add({ text: unescapeXml(t.raw) });
        break;
      case "cdata":
        add({ text: t.raw.slice(9, -3) });
        break;
      case "comment":
        notes.comments = true;
        break;
      case "pi":
        // The XML declaration is not content, so it is not worth a notice.
        if (!/^<\?xml[\s?]/i.test(t.raw)) notes.instructions = true;
        break;
      default:
        break;
    }
  }
  return top;
}

const blank = (s: string) => /^[ \t\r\n]*$/.test(s);

/** Group child elements by name in order of first appearance; repeated names become arrays. */
function children(kids: Kid[], notes: Notes): [string, Json][] {
  const groups = new Map<string, Json[]>();
  for (const k of kids) {
    if (!isEl(k)) continue;
    const list = groups.get(k.name) ?? [];
    list.push(elementValue(k, notes));
    groups.set(k.name, list);
  }
  return [...groups].map(([name, list]) => [name, list.length === 1 ? list[0] : list]);
}

function elementValue(el: El, notes: Notes): Json {
  const pieces = el.kids.filter((k): k is { text: string } => !isEl(k)).map((k) => k.text);
  const hasText = pieces.some((p) => !blank(p));
  const hasChildren = el.kids.some(isEl);
  if (el.attrs.length === 0 && !hasChildren) return hasText ? pieces.join("") : "";
  const obj = new Obj();
  for (const a of el.attrs) obj.entries.push([`@${a.name}`, unescapeXml(a.value)]);
  if (hasText) {
    if (hasChildren) notes.mixed = true;
    obj.entries.push(["#text", hasChildren ? pieces.map((p) => p.trim()).filter(Boolean).join(" ") : pieces.join("")]);
  }
  obj.entries.push(...children(el.kids, notes));
  return obj;
}

/**
 * XML to JSON with the `@attr` / `#text` convention (ADR-0007): the root's name is the top-level key, attributes are
 * `@name` keys, repeated siblings become an array, text-only elements become strings and empty ones `""`.
 * Mixed content is flattened and comments and processing instructions are dropped, each reported once.
 */
export function xmlToJson(text: string, ctx: ToolContext): ToolResult {
  const valid = validateXml(text, { fragment: ctx.selection });
  if (!valid.ok) return { ok: false, message: valid.message, line: valid.line, column: valid.column, offset: valid.offset };
  const tokens = tokenizeXml(text);
  if (!tokens.ok) return { ok: false, message: tokens.message, line: tokens.line, column: tokens.column, offset: tokens.offset };
  const notes: Notes = { comments: false, instructions: false, mixed: false, looseText: false };
  const top = buildTree(tokens, notes);
  if (top.some((k) => !isEl(k) && !blank(k.text))) notes.looseText = true;
  const result = new Obj(children(top, notes));
  const warnings: string[] = [];
  if (notes.comments) warnings.push("comments were dropped");
  if (notes.instructions) warnings.push("processing instructions were dropped");
  if (notes.mixed) warnings.push("mixed content (text between elements) was flattened into #text");
  if (notes.looseText) warnings.push("text outside elements was dropped");
  return { ok: true, text: withSourceNewline(text, print(result, "")), warnings: warnings.length > 0 ? warnings : undefined };
}

/** XML 1.0 name characters (letters beyond ASCII included), with the namespace colon allowed. */
const NAME = /^[\p{L}_:][\p{L}\p{N}_:.\-·]*$/u;

class InvalidName extends Error {}

const text = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const isScalar = (v: unknown) => v === null || v === undefined || ["string", "number", "boolean", "bigint"].includes(typeof v);

function checkName(name: string, path: string): void {
  if (!NAME.test(name)) throw new InvalidName(`${path} is not a valid XML name`);
}

/** One element, or several when the value is an array, as indented lines. */
function emit(name: string, value: unknown, depth: number, path: string): string[] {
  const pad = "  ".repeat(depth);
  checkName(name, path);
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => {
      if (Array.isArray(item)) throw new InvalidName(`${path}[${i}] is an array inside an array, which XML cannot represent`);
      return emit(name, item, depth, `${path}[${i}]`);
    });
  }
  if (isScalar(value)) {
    const s = text(value);
    return [s === "" ? `${pad}<${name}/>` : `${pad}<${name}>${escText(s)}</${name}>`];
  }
  if (!isMap(value)) return [`${pad}<${name}>${escText(String(value))}</${name}>`];
  let attrs = "";
  let body: string | null = null;
  const kids: string[] = [];
  for (const [rawKey, v] of value) {
    const key = String(rawKey);
    const at = `${path}.${key}`;
    if (key.startsWith("@")) {
      checkName(key.slice(1), at);
      if (!isScalar(v)) throw new InvalidName(`${at} must be a plain value to be an attribute`);
      attrs += ` ${key.slice(1)}="${escAttr(text(v))}"`;
    } else if (key === "#text") {
      if (!isScalar(v)) throw new InvalidName(`${at} must be a plain value to be element text`);
      body = text(v);
    } else {
      kids.push(...emit(key, v, depth + 1, at));
    }
  }
  if (kids.length === 0) return [body ? `${pad}<${name}${attrs}>${escText(body)}</${name}>` : `${pad}<${name}${attrs}/>`];
  return [`${pad}<${name}${attrs}>`, ...(body ? [`${pad}  ${escText(body)}`] : []), ...kids, `${pad}</${name}>`];
}

/**
 * JSON to XML (ADR-0007, reverse rules): a one-key object with a non-array value is the root, anything else is wrapped
 * in `<root>`; `@name` is an attribute, `#text` is text, arrays repeat elements, `null` and `""` are empty elements.
 */
export async function jsonToXml(src: string, _ctx: ToolContext): Promise<ToolResult> {
  const r = await readJson(src);
  if (!r.ok) return r;
  const v = r.value;
  try {
    let lines: string[];
    if (isMap(v) && v.size === 1 && !Array.isArray([...v.values()][0])) {
      const [[key, value]] = [...v];
      lines = emit(String(key), value, 0, String(key));
    } else {
      lines = emit("root", Array.isArray(v) ? new Map([["item", v]]) : v, 0, "root");
    }
    return { ok: true, text: withSourceNewline(src, lines.join("\n")) };
  } catch (e) {
    if (e instanceof InvalidName) return { ok: false, message: e.message };
    throw e;
  }
}

export { escapeXml };
