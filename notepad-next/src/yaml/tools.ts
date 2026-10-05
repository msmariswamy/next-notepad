import type { Document } from "yaml";
import { formatCode } from "../format/format";
import type { ToolContext, ToolResult } from "../tools/runTool";

/** The yaml package is loaded on first use, so none of it is paid for at start-up (ADR-0008). */
const loadYaml = () => import("yaml");

/** Documents larger than this are not checked while typing, the same limit JSON and XML use. */
export const YAML_ERROR_MAX_CHARS = 1_000_000;

export interface YamlProblem {
  message: string;
  line: number;
  column: number;
  offset: number;
}

/** The package appends "at line N, column M:" and a code frame to its messages; keep just the first sentence. */
const cleanMessage = (m: string) => m.split("\n")[0].replace(/\s+at line \d+, column \d+:?\s*$/, "").trim();

/** Parse every document and return them, or the first error in text order. */
export async function parseYaml(text: string): Promise<{ docs: Document.Parsed[]; error?: undefined } | { docs?: undefined; error: YamlProblem }> {
  const { parseAllDocuments } = await loadYaml();
  const parsed = parseAllDocuments(text, { prettyErrors: true });
  const docs = Array.isArray(parsed) ? parsed : [parsed];
  for (const doc of docs) {
    const e = doc.errors[0];
    if (e) {
      const pos = e.linePos?.[0];
      return { error: { message: cleanMessage(e.message), line: pos?.line ?? 1, column: pos?.col ?? 1, offset: e.pos[0] } };
    }
  }
  return { docs };
}

const fail = (p: YamlProblem): Extract<ToolResult, { ok: false }> => ({ ok: false, message: p.message, line: p.line, column: p.column, offset: p.offset });

/** Range to underline for the first error, or null when valid, blank or too large. */
export async function yamlErrorRange(text: string): Promise<{ from: number; to: number } | null> {
  if (text.length > YAML_ERROR_MAX_CHARS || text.trim() === "") return null;
  const r = await parseYaml(text);
  if (!r.error) return null;
  if (r.error.offset >= text.length) return { from: Math.max(0, text.length - 1), to: text.length };
  return { from: r.error.offset, to: r.error.offset + 1 };
}

export async function validateYamlTool(text: string, _ctx: ToolContext): Promise<ToolResult> {
  const r = await parseYaml(text);
  if (r.error) return fail(r.error);
  return { ok: true, text, message: r.docs.length > 1 ? `YAML is valid (${r.docs.length} documents)` : "YAML is valid" };
}

/** Keep the original's trailing newline (or lack of one), as Format Document does. */
const matchTrailingNewline = (original: string, out: string) => (/\n$/.test(original) ? (out.endsWith("\n") ? out : out + "\n") : out.replace(/\n+$/, ""));

/** Each document after the first already starts with its own `---` marker, so they join with nothing between. */
function stringifyDocs(docs: Document.Parsed[], options: object): string {
  return docs.map((d) => d.toString(options)).join("");
}

/** Sort mapping keys at every depth, ascending. Comments stay with their keys; lists keep their order; anchors and aliases survive. */
export async function sortYamlKeys(text: string, _ctx: ToolContext): Promise<ToolResult> {
  const r = await parseYaml(text);
  if (r.error) return fail(r.error);
  const { visit, isScalar } = await loadYaml();
  // The package only sorts maps it builds from JavaScript values, so sort parsed ones here. A pair's comments and
  // blank lines hang on its key node, so they move with it.
  const keyOf = (k: unknown) => (isScalar(k) ? String(k.value) : String(k));
  for (const doc of r.docs) {
    visit(doc, {
      Map(_key, map) {
        map.items.sort((a, b) => (keyOf(a.key) < keyOf(b.key) ? -1 : keyOf(a.key) > keyOf(b.key) ? 1 : 0));
      },
    });
  }
  try {
    return { ok: true, text: matchTrailingNewline(text, stringifyDocs(r.docs, { lineWidth: 0 })) };
  } catch (e) {
    // Sorting can move an alias in front of its anchor, which YAML does not allow.
    return { ok: false, message: `Cannot sort: ${e instanceof Error ? e.message.split("\n")[0] : e}` };
  }
}

/** Rewrite a single-document YAML text in flow style on one line per structure; comments are dropped (and reported). */
export async function compactYaml(text: string, _ctx: ToolContext): Promise<ToolResult> {
  const r = await parseYaml(text);
  if (r.error) return fail(r.error);
  if (r.docs.length > 1) {
    return { ok: false, message: "Cannot compact YAML with several documents (--- separators); split it or compact each document on its own" };
  }
  const { visit, isNode } = await loadYaml();
  const doc = r.docs[0];
  let hadComments = Boolean(doc.commentBefore || doc.comment);
  doc.commentBefore = null;
  doc.comment = null;
  visit(doc, (_key, node) => {
    if (isNode(node)) {
      if (node.comment || node.commentBefore) hadComments = true;
      node.comment = null;
      node.commentBefore = null;
      node.spaceBefore = false;
    }
  });
  const out = doc.toString({ collectionStyle: "flow", lineWidth: 0 });
  return { ok: true, text: matchTrailingNewline(text, out), warnings: hadComments ? ["comments were dropped"] : undefined };
}

/** Format with Prettier's YAML parser, the same engine as Format Document, with 2 or 4 spaces (YAML forbids tab indentation). */
export async function formatYaml(text: string, indent: 2 | 4, _ctx: ToolContext): Promise<ToolResult> {
  const r = await formatCode("YAML", text, { tabWidth: indent, useTabs: false });
  return r.ok ? { ok: true, text: r.text } : { ok: false, message: r.message, line: r.line, column: r.column };
}

const leadingWs = (line: string) => /^[ \t]*/.exec(line)![0];

/**
 * A selection is usually an indented block (design D5): remove the common indent, run the tool on it as its own
 * document, and put the indent back on every non-blank line. Error columns are shifted back by the removed indent.
 */
export async function withYamlSelection(text: string, ctx: ToolContext, run: (t: string) => Promise<ToolResult>): Promise<ToolResult> {
  if (!ctx.selection) return run(text);
  const lines = text.split("\n");
  const nonBlank = lines.filter((l) => l.trim() !== "");
  if (nonBlank.length === 0) return run(text);
  let indent = leadingWs(nonBlank[0]);
  for (const l of nonBlank) {
    const ws = leadingWs(l);
    let n = 0;
    while (n < indent.length && n < ws.length && indent[n] === ws[n]) n++;
    indent = indent.slice(0, n);
  }
  if (indent === "") return run(text);
  const dedented = lines.map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l)).join("\n");
  const r = await run(dedented);
  if (!r.ok) return r.column !== undefined ? { ...r, column: r.column + indent.length } : r;
  return { ...r, text: r.text.split("\n").map((l) => (l.trim() === "" ? l : indent + l)).join("\n") };
}
