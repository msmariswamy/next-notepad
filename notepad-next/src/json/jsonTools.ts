/**
 * JSON tools (spec: json-tools). Own strict parser instead of JSON.parse because engines differ
 * on error messages (Safari reports no position) and JSON.parse would reorder integer-like keys
 * and round big numbers; here numbers and key order are kept exactly as written.
 */

export type JsonError = { ok: false; message: string; offset: number; line: number; column: number };
export type JsonOk = { ok: true };
export type JsonResult = { ok: true; text: string } | JsonError;

type Node =
  | { t: "obj"; entries: [string, Node][] } // keys kept raw (escaped as written) so output is faithful
  | { t: "arr"; items: Node[] }
  | { t: "lit"; raw: string }; // string, number, true, false, null as written

class ParseError extends Error {
  constructor(
    message: string,
    public offset: number,
  ) {
    super(message);
  }
}

const WS = new Set([" ", "\t", "\n", "\r"]);
const HEX = /^[0-9a-fA-F]{4}$/;

class Parser {
  private i = 0;
  constructor(private s: string) {}

  parseDocument(): Node {
    this.ws();
    if (this.i >= this.s.length) throw this.end();
    const v = this.value();
    this.ws();
    if (this.i < this.s.length) throw new ParseError(`Unexpected content after JSON value: ${this.show()}`, this.i);
    return v;
  }

  private end() {
    return new ParseError("Unexpected end of JSON input", this.s.length);
  }

  private show(): string {
    return JSON.stringify(this.s[this.i] ?? "");
  }

  private ws(): void {
    while (this.i < this.s.length && WS.has(this.s[this.i])) this.i++;
  }

  private value(): Node {
    const c = this.s[this.i];
    if (c === undefined) throw this.end();
    if (c === "{") return this.object();
    if (c === "[") return this.array();
    if (c === '"') return { t: "lit", raw: this.string() };
    if (c === "-" || (c >= "0" && c <= "9")) return { t: "lit", raw: this.number() };
    for (const word of ["true", "false", "null"]) {
      if (this.s.startsWith(word, this.i)) {
        this.i += word.length;
        return { t: "lit", raw: word };
      }
    }
    throw new ParseError(`Unexpected token ${this.show()}`, this.i);
  }

  private object(): Node {
    this.i++; // {
    const entries: [string, Node][] = [];
    this.ws();
    if (this.s[this.i] === "}") return (this.i++, { t: "obj", entries });
    for (;;) {
      this.ws();
      if (this.i >= this.s.length) throw this.end();
      if (this.s[this.i] !== '"') throw new ParseError(`Expected a property name in double quotes, found ${this.show()}`, this.i);
      const key = this.string();
      this.ws();
      if (this.s[this.i] !== ":") throw this.s[this.i] === undefined ? this.end() : new ParseError(`Expected ':' after property name, found ${this.show()}`, this.i);
      this.i++;
      this.ws();
      const v = this.value();
      // Duplicate keys collapse like an object literal would: first position, last value.
      const existing = entries.findIndex(([k]) => keyValue(k) === keyValue(key));
      if (existing >= 0) entries[existing][1] = v;
      else entries.push([key, v]);
      this.ws();
      const c = this.s[this.i];
      if (c === ",") {
        this.i++;
        continue;
      }
      if (c === "}") return (this.i++, { t: "obj", entries });
      throw c === undefined ? this.end() : new ParseError(`Expected ',' or '}' after property value, found ${this.show()}`, this.i);
    }
  }

  private array(): Node {
    this.i++; // [
    const items: Node[] = [];
    this.ws();
    if (this.s[this.i] === "]") return (this.i++, { t: "arr", items });
    for (;;) {
      this.ws();
      items.push(this.value());
      this.ws();
      const c = this.s[this.i];
      if (c === ",") {
        this.i++;
        continue;
      }
      if (c === "]") return (this.i++, { t: "arr", items });
      throw c === undefined ? this.end() : new ParseError(`Expected ',' or ']' after array element, found ${this.show()}`, this.i);
    }
  }

  private string(): string {
    const start = this.i;
    this.i++; // opening quote
    for (;;) {
      const c = this.s[this.i];
      if (c === undefined) throw new ParseError("Unterminated string", start);
      if (c === '"') return this.s.slice(start, ++this.i);
      if (c < " ") throw new ParseError("Control character in string (use \\n, \\t, ...)", this.i);
      if (c === "\\") {
        const e = this.s[this.i + 1];
        if (e === "u") {
          if (!HEX.test(this.s.slice(this.i + 2, this.i + 6))) throw new ParseError("Invalid \\u escape (needs 4 hex digits)", this.i);
          this.i += 6;
        } else if (e !== undefined && '"\\/bfnrt'.includes(e)) this.i += 2;
        else throw new ParseError(`Invalid escape sequence \\${e ?? ""}`, this.i);
      } else this.i++;
    }
  }

  private number(): string {
    const start = this.i;
    const digits = () => {
      const from = this.i;
      while (this.s[this.i] >= "0" && this.s[this.i] <= "9") this.i++;
      return this.i - from;
    };
    if (this.s[this.i] === "-") this.i++;
    if (this.s[this.i] === "0") this.i++;
    else if (digits() === 0) throw new ParseError("Invalid number: expected a digit", this.i);
    if (this.s[this.i] === "0" || (this.s[start] === "0" && this.s[start + 1] >= "0" && this.s[start + 1] <= "9")) {
      throw new ParseError("Invalid number: leading zeros are not allowed", start);
    }
    if (this.s[this.i] === ".") {
      this.i++;
      if (digits() === 0) throw new ParseError("Invalid number: expected a digit after '.'", this.i);
    }
    if (this.s[this.i] === "e" || this.s[this.i] === "E") {
      this.i++;
      if (this.s[this.i] === "+" || this.s[this.i] === "-") this.i++;
      if (digits() === 0) throw new ParseError("Invalid number: expected a digit in the exponent", this.i);
    }
    return this.s.slice(start, this.i);
  }
}

/** Decoded key text so `"a"` and `"a"` count as duplicates. */
function keyValue(raw: string): string {
  return JSON.parse(raw) as string;
}

function lineColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = text.indexOf("\n"); i >= 0 && i < offset; i = text.indexOf("\n", i + 1)) {
    line++;
    lineStart = i + 1;
  }
  return { line, column: offset - lineStart + 1 };
}

function parse(text: string): { ok: true; node: Node } | JsonError {
  try {
    return { ok: true, node: new Parser(text).parseDocument() };
  } catch (e) {
    if (!(e instanceof ParseError)) throw e;
    return { ok: false, message: e.message, offset: e.offset, ...lineColumn(text, e.offset) };
  }
}

export function validate(text: string): JsonOk | JsonError {
  const r = parse(text);
  return r.ok ? { ok: true } : r;
}

function print(node: Node, indent: string, depth: number): string {
  if (node.t === "lit") return node.raw;
  const pad = indent ? "\n" + indent.repeat(depth + 1) : "";
  const close = indent ? "\n" + indent.repeat(depth) : "";
  if (node.t === "arr") {
    if (node.items.length === 0) return "[]";
    return "[" + pad + node.items.map((n) => print(n, indent, depth + 1)).join("," + pad) + close + "]";
  }
  if (node.entries.length === 0) return "{}";
  const sep = indent ? ": " : ":";
  return "{" + pad + node.entries.map(([k, v]) => k + sep + print(v, indent, depth + 1)).join("," + pad) + close + "}";
}

/** Re-indent valid JSON; invalid JSON is never modified and yields the error position. */
export function prettyPrint(text: string, indent = "  "): JsonResult {
  const r = parse(text);
  return r.ok ? { ok: true, text: print(r.node, indent, 0) } : r;
}

export function minify(text: string): JsonResult {
  const r = parse(text);
  return r.ok ? { ok: true, text: print(r.node, "", 0) } : r;
}

function sortNode(node: Node): Node {
  if (node.t === "lit") return node;
  if (node.t === "arr") return { t: "arr", items: node.items.map(sortNode) };
  const entries = node.entries
    .map(([k, v]): [string, Node] => [k, sortNode(v)])
    .sort((a, b) => {
      const ka = keyValue(a[0]);
      const kb = keyValue(b[0]);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  return { t: "obj", entries };
}

/** Sort object keys ascending, recursively (arrays keep their order); the result is pretty-printed. */
export function sortKeys(text: string, indent = "  "): JsonResult {
  const r = parse(text);
  return r.ok ? { ok: true, text: print(sortNode(r.node), indent, 0) } : r;
}

/** Turn arbitrary text into a JSON string literal (quotes, backslashes, newlines and control characters escaped). */
export function escapeAsJsonString(text: string): string {
  return JSON.stringify(text);
}

/**
 * Inverse of escapeAsJsonString. Accepts a quoted literal, or just the escaped body without quotes.
 * Returns null when the text is not a valid JSON string.
 */
export function unescapeJsonString(text: string): string | null {
  const t = text.trim();
  const attempt = (candidate: string): string | null => {
    try {
      const v = JSON.parse(candidate);
      return typeof v === "string" ? v : null;
    } catch {
      return null;
    }
  };
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    const quoted = attempt(t);
    if (quoted !== null) return quoted;
  }
  // Escaped body without surrounding quotes; raw newlines are not valid inside a JSON string.
  return attempt(`"${t.replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`);
}
