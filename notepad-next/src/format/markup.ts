/**
 * Small, predictable pretty-printer for XML and HTML: every element goes on its own line,
 * children are indented, elements holding only text stay on one line. Unlike Prettier it
 * always expands nested elements, which is what an XML/HTML "format" command is expected to do.
 */

export interface MarkupOptions {
  unit: string;
  html: boolean;
}

export type MarkupResult = { ok: true; text: string } | { ok: false; message: string; line: number; column: number };

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAW = new Set(["pre", "textarea", "script", "style"]);
// Elements whose closing tag may be omitted: a new sibling closes the previous one.
const AUTO_CLOSE: Record<string, string[]> = {
  li: ["li"],
  p: ["p"],
  dt: ["dt", "dd"],
  dd: ["dt", "dd"],
  tr: ["tr"],
  td: ["td", "th"],
  th: ["td", "th"],
  option: ["option"],
  thead: ["tbody", "tfoot"],
  tbody: ["tbody", "tfoot"],
};

type Token =
  | { t: "open"; name: string; raw: string; selfClose: boolean; at: number }
  | { t: "close"; name: string; raw: string; at: number }
  | { t: "text"; raw: string; at: number }
  | { t: "other"; raw: string; at: number }; // comment, CDATA, doctype, processing instruction

function tokenize(src: string, html: boolean): Token[] {
  const out: Token[] = [];
  let i = 0;
  const push = (t: Token) => out.push(t);
  while (i < src.length) {
    if (src[i] !== "<") {
      const end = src.indexOf("<", i);
      const stop = end < 0 ? src.length : end;
      push({ t: "text", raw: src.slice(i, stop), at: i });
      i = stop;
      continue;
    }
    const special = [
      ["<!--", "-->"],
      ["<![CDATA[", "]]>"],
      ["<?", "?>"],
    ].find(([open]) => src.startsWith(open, i));
    if (special) {
      const end = src.indexOf(special[1], i + special[0].length);
      const stop = end < 0 ? src.length : end + special[1].length;
      push({ t: "other", raw: src.slice(i, stop), at: i });
      i = stop;
      continue;
    }
    if (src[i + 1] === "!") {
      const end = src.indexOf(">", i);
      const stop = end < 0 ? src.length : end + 1;
      push({ t: "other", raw: src.slice(i, stop), at: i });
      i = stop;
      continue;
    }
    // A tag: scan to the closing > while respecting quoted attribute values.
    let j = i + 1;
    let quote = "";
    while (j < src.length) {
      const c = src[j];
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
      j++;
    }
    const raw = src.slice(i, j + 1);
    const closing = raw.startsWith("</");
    const name = /^<\/?\s*([^\s/>]+)/.exec(raw)?.[1] ?? "";
    if (closing) push({ t: "close", name: html ? name.toLowerCase() : name, raw, at: i });
    else push({ t: "open", name: html ? name.toLowerCase() : name, raw, selfClose: raw.endsWith("/>"), at: i });
    i = j + 1;
    // Raw-text elements: copy everything up to the matching close tag untouched.
    const last = out[out.length - 1];
    if (html && last.t === "open" && !last.selfClose && RAW.has(last.name)) {
      const closeRe = new RegExp(`</${last.name}\\s*>`, "i");
      const m = closeRe.exec(src.slice(i));
      const stop = m ? i + m.index : src.length;
      if (stop > i) push({ t: "text", raw: src.slice(i, stop), at: i });
      i = stop;
    }
  }
  return out;
}

interface El {
  kind: "el";
  name: string;
  open: string;
  selfClose: boolean;
  children: Node[];
  close?: string;
  raw: boolean;
}
type Node = El | { kind: "text"; text: string; raw: boolean } | { kind: "other"; text: string };

function lineCol(src: string, offset: number) {
  const before = src.slice(0, offset);
  const line = before.split("\n").length;
  return { line, column: offset - before.lastIndexOf("\n") };
}

function build(src: string, opts: MarkupOptions): { ok: true; nodes: Node[] } | MarkupResult & { ok: false } {
  const root: El = { kind: "el", name: "#root", open: "", selfClose: false, children: [], raw: false };
  const stack: El[] = [root];
  const fail = (message: string, at: number) => ({ ok: false as const, message, ...lineCol(src, at) });
  for (const tok of tokenize(src, opts.html)) {
    const top = stack[stack.length - 1];
    if (tok.t === "text") {
      if (top.raw) top.children.push({ kind: "text", text: tok.raw, raw: true });
      else if (tok.raw.trim() !== "") top.children.push({ kind: "text", text: tok.raw.trim().replace(/\s+/g, " "), raw: false });
    } else if (tok.t === "other") top.children.push({ kind: "other", text: tok.raw });
    else if (tok.t === "open") {
      if (opts.html) {
        // Implied end tags: <li> closes an open <li>, etc.
        while (stack.length > 1 && AUTO_CLOSE[stack[stack.length - 1].name]?.includes(tok.name)) stack.pop();
      }
      const parent = stack[stack.length - 1];
      const el: El = { kind: "el", name: tok.name, open: tok.raw, selfClose: tok.selfClose || (opts.html && VOID.has(tok.name)), children: [], raw: opts.html && RAW.has(tok.name) };
      parent.children.push(el);
      if (!el.selfClose) stack.push(el);
    } else {
      // Closing tag: find the matching open element, closing implied ones in HTML only.
      let idx = stack.length - 1;
      while (idx > 0 && stack[idx].name !== tok.name) {
        if (!(opts.html && AUTO_CLOSE[stack[idx].name])) {
          return fail(`Closing tag ${tok.raw} does not match the open tag <${stack[idx].name}>`, tok.at);
        }
        idx--;
      }
      if (idx === 0) return fail(`Closing tag ${tok.raw} has no matching opening tag`, tok.at);
      stack.length = idx + 1;
      stack[idx].close = tok.raw;
      stack.pop();
    }
  }
  if (stack.length > 1) {
    const open = stack[stack.length - 1];
    return fail(`Element <${open.name}> is not closed`, src.length);
  }
  return { ok: true, nodes: root.children };
}

function render(nodes: Node[], depth: number, unit: string, out: string[]): void {
  const pad = unit.repeat(depth);
  for (const n of nodes) {
    if (n.kind === "other") out.push(pad + n.text);
    else if (n.kind === "text") out.push(pad + n.text);
    else if (n.selfClose) out.push(pad + n.open);
    else if (n.raw) out.push(pad + n.open + n.children.map((c) => (c.kind === "text" ? c.text : "")).join("") + (n.close ?? ""));
    else if (n.children.every((c) => c.kind === "text") && n.children.length <= 1) {
      out.push(pad + n.open + (n.children[0]?.kind === "text" ? n.children[0].text : "") + (n.close ?? ""));
    } else {
      out.push(pad + n.open);
      render(n.children, depth + 1, unit, out);
      if (n.close) out.push(pad + n.close);
    }
  }
}

export function formatMarkup(src: string, opts: MarkupOptions): MarkupResult {
  const built = build(src, opts);
  if (!built.ok) return built;
  const lines: string[] = [];
  render(built.nodes, 0, opts.unit, lines);
  return { ok: true, text: lines.join("\n") };
}
