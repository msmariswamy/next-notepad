/**
 * Brace-based Java re-indenter. It does not parse Java; it understands strings, char literals,
 * text blocks and comments well enough to put every block, statement and member on its own,
 * consistently indented line without ever altering literal contents.
 */

export type JavaResult = { ok: true; text: string } | { ok: false; message: string; line: number; column: number };

type Tok = { k: "word" | "str" | "lc" | "bc" | "punct"; v: string; nlBefore: number; at: number };

function lex(src: string): Tok[] | { error: string; at: number } {
  const toks: Tok[] = [];
  let i = 0;
  let nl = 0;
  const push = (k: Tok["k"], v: string, at: number) => {
    toks.push({ k, v, nlBefore: nl, at });
    nl = 0;
  };
  while (i < src.length) {
    const c = src[i];
    if (c === "\n") {
      nl++;
      i++;
    } else if (/\s/.test(c)) i++;
    else if (src.startsWith("//", i)) {
      const end = src.indexOf("\n", i);
      const stop = end < 0 ? src.length : end;
      push("lc", src.slice(i, stop).trimEnd(), i);
      i = stop;
    } else if (src.startsWith("/*", i)) {
      const end = src.indexOf("*/", i + 2);
      if (end < 0) return { error: "Unterminated comment", at: i };
      push("bc", src.slice(i, end + 2), i);
      i = end + 2;
    } else if (src.startsWith('"""', i)) {
      const end = src.indexOf('"""', i + 3);
      if (end < 0) return { error: "Unterminated text block", at: i };
      push("str", src.slice(i, end + 3), i);
      i = end + 3;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\n") return { error: "Unterminated string literal", at: i };
        j += src[j] === "\\" ? 2 : 1;
      }
      if (j >= src.length) return { error: "Unterminated string literal", at: i };
      push("str", src.slice(i, j + 1), i);
      i = j + 1;
    } else if (/[\w$@.]/.test(c)) {
      let j = i;
      while (j < src.length && /[\w$@.]/.test(src[j])) j++;
      push("word", src.slice(i, j), i);
      i = j;
    } else {
      push("punct", c, i);
      i++;
    }
  }
  return toks;
}

const lineCol = (src: string, at: number) => {
  const before = src.slice(0, at);
  return { line: before.split("\n").length, column: at - before.lastIndexOf("\n") };
};

const NO_SPACE_BEFORE = new Set([";", ",", ")", "]", ".", "(", "[", "?"]);
const NO_SPACE_AFTER = new Set(["(", "[", ".", "@", "!", "~"]);

export function formatJava(src: string, unit: string): JavaResult {
  const lexed = lex(src);
  if (!Array.isArray(lexed)) return { ok: false, message: lexed.error, ...lineCol(src, lexed.at) };
  const toks = lexed;

  const lines: { depth: number; text: string; blankBefore: boolean }[] = [];
  let cur = "";
  let depth = 0;
  let parens = 0;
  let pendingBlank = false;
  let caseDepth = -1; // brace depth of the switch whose case body we are inside, else -1
  const braceKinds: ("block" | "inline" | "switch")[] = [];
  let prev: Tok | null = null;
  let prevSig: Tok | null = null; // previous non-comment token

  const flush = () => {
    const text = cur.trim();
    if (text !== "") {
      // Statements following a case label sit one level deeper than the label.
      const inCase = caseDepth >= 0 && caseDepth === braceKinds.length && !/^(case\b|default\s*:)/.test(text) && !text.startsWith("}");
      lines.push({ depth: depth + (inCase ? 1 : 0), text, blankBefore: pendingBlank });
      pendingBlank = false;
    }
    cur = "";
  };

  const add = (t: Tok) => {
    const spaceBefore =
      cur !== "" &&
      !(t.k === "punct" && NO_SPACE_BEFORE.has(t.v)) &&
      !(prev && prev.k === "punct" && NO_SPACE_AFTER.has(prev.v)) &&
      !(t.k === "punct" && t.v === "(" && prev?.k === "word");
    // Keep the author's spacing around operators/words as written when it was adjacent.
    const wasAdjacent = prev !== null && src.slice(prev.at + prev.v.length, t.at).length === 0;
    // "}else", "}catch" ... always read better with a space, whatever the source had.
    const afterBrace = prev?.k === "punct" && prev.v === "}" && t.k === "word";
    cur += ((spaceBefore && !wasAdjacent) || (afterBrace && cur !== "") ? " " : "") + t.v;
  };

  for (let idx = 0; idx < toks.length; idx++) {
    const t = toks[idx];
    const next = toks[idx + 1];
    if (t.nlBefore >= 2 && cur === "") pendingBlank = true;

    if (t.k === "lc") {
      // A trailing line comment stays on the line it follows.
      if (cur !== "" && t.nlBefore === 0) {
        cur += " " + t.v;
        flush();
      } else {
        flush();
        cur = t.v;
        flush();
      }
      prev = t;
      continue;
    }
    if (t.k === "bc") {
      flush();
      const parts = t.v.split("\n").map((l, i) => (i === 0 ? l.trim() : l.trim().startsWith("*") ? " " + l.trim() : l.trim()));
      lines.push({ depth, text: parts.join("\n"), blankBefore: pendingBlank });
      pendingBlank = false;
      prev = t;
      continue;
    }

    if (t.k === "punct") {
      if (t.v === "(") parens++;
      else if (t.v === ")") parens = Math.max(0, parens - 1);

      if (t.v === "{") {
        // Array initialisers, annotation values and lambda-free "= {" stay inline.
        const inline = prevSig !== null && ((prevSig.k === "punct" && ["=", ",", "[", "]", "("].includes(prevSig.v)) || (prevSig.k === "punct" && prevSig.v === "{" && braceKinds[braceKinds.length - 1] === "inline"));
        const isSwitch = /\bswitch\b[^{;]*$/.test(cur) && !inline;
        if (inline) {
          braceKinds.push("inline");
          cur += (cur !== "" && !cur.endsWith("=") && !cur.endsWith("(") && !cur.endsWith(",") ? "" : "") + "{";
        } else {
          cur += (cur !== "" && !cur.endsWith(" ") && !cur.endsWith("(") ? " " : "") + "{";
          flush();
          braceKinds.push(isSwitch ? "switch" : "block");
          if (isSwitch) caseDepth = braceKinds.length; // body of this switch is at this nesting level
          depth++;
        }
        prev = prevSig = t;
        continue;
      }
      if (t.v === "}") {
        const kind = braceKinds.pop();
        if (kind === "inline") {
          cur += "}";
        } else {
          flush();
          if (kind === "switch") caseDepth = -1;
          depth = Math.max(0, depth - 1);
          cur = "}";
          // else / catch / finally / while (do-while) continue on the same line.
          const nextWord = next && next.k === "word" ? next.v : "";
          if (["else", "catch", "finally"].includes(nextWord)) {
            prev = prevSig = t;
            continue;
          }
          if (next && next.k === "punct" && (next.v === ";" || next.v === ")" || next.v === ",")) {
            prev = prevSig = t;
            continue;
          }
          flush();
        }
        if (kind === undefined) {
          return { ok: false, message: "Unmatched closing brace }", ...lineCol(src, t.at) };
        }
        prev = prevSig = t;
        continue;
      }
      if (t.v === ";") {
        add(t);
        if (parens === 0) {
          // A trailing // comment on the same source line stays with the statement.
          if (!(next && next.k === "lc" && next.nlBefore === 0)) flush();
        }
        prev = prevSig = t;
        continue;
      }
      if (t.v === ":" && /^(case\b|default\b)/.test(cur.trim()) && parens === 0) {
        add(t);
        flush();
        prev = prevSig = t;
        continue;
      }
      if (t.v === "@") {
        // annotation: "@" followed by a word is lexed as one word, so a lone @ is rare
        add(t);
        prev = prevSig = t;
        continue;
      }
    }

    // Annotations on their own line stay on their own line.
    if (t.k === "word" && t.v.startsWith("@") && cur !== "" && t.nlBefore > 0 && /^\s*$/.test("")) {
      flush();
    }
    add(t);
    // An annotation without arguments, followed by a newline in the source, is a line by itself.
    if (t.k === "word" && t.v.startsWith("@") && next && next.nlBefore > 0 && !(next.k === "punct" && next.v === "(") && parens === 0) flush();
    prev = prevSig = t;
  }

  flush();
  if (braceKinds.length > 0) {
    const last = toks[toks.length - 1];
    return { ok: false, message: "Unclosed brace {", ...lineCol(src, last ? last.at : 0) };
  }

  const out: string[] = [];
  for (const l of lines) {
    if (l.blankBefore && out.length > 0) out.push("");
    const pad = unit.repeat(l.depth);
    // Text blocks keep their inner lines exactly; comment continuation lines follow the indentation.
    const verbatim = l.text.includes('"""');
    out.push(l.text.split("\n").map((part, i) => (i === 0 || !verbatim ? pad + part : part)).join("\n"));
  }
  return { ok: true, text: out.join("\n") };
}
