import type { ToolContext, ToolResult } from "../tools/runTool";
import { parseYaml } from "../yaml/tools";
import { readJson, withSourceNewline } from "./json";
import { Obj, print, type Json } from "./jsonOut";

/** JSON to block-style YAML with a 2-space indent; key order and large integers are kept. */
export async function jsonToYaml(text: string, _ctx: ToolContext): Promise<ToolResult> {
  const r = await readJson(text);
  if (!r.ok) return r;
  const { stringify } = await import("yaml");
  return { ok: true, text: withSourceNewline(text, stringify(r.value, { indent: 2, lineWidth: 0 })) };
}

interface Notes {
  keysConverted: boolean;
  bigInts: boolean;
}

class Unrepresentable extends Error {}

function toJson(value: unknown, path: string, notes: Notes, seen: Set<unknown>): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Unrepresentable(`${path || "(root)"} is ${Number.isNaN(value) ? ".nan" : value > 0 ? ".inf" : "-.inf"}, which cannot be represented in JSON`);
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) notes.bigInts = true;
    return value;
  }
  if (typeof value === "bigint") {
    notes.bigInts = true;
    return Number(value);
  }
  if (seen.has(value)) throw new Unrepresentable(`${path || "(root)"} refers back to one of its own ancestors (a circular alias), which JSON cannot represent`);
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((x, i) => toJson(x, `${path}[${i}]`, notes, seen));
    if (value instanceof Map) {
      const out = new Obj();
      const used = new Set<string>();
      for (const [k, v] of value) {
        if (typeof k === "object" && k !== null) throw new Unrepresentable(`${path || "(root)"} has a key that is a collection, which JSON cannot represent`);
        const key = typeof k === "string" ? k : String(k);
        if (typeof k !== "string") notes.keysConverted = true;
        if (used.has(key)) throw new Unrepresentable(`${path || "(root)"} has two keys that both become "${key}"`);
        used.add(key);
        out.entries.push([key, toJson(v, path ? `${path}.${key}` : key, notes, seen)]);
      }
      return out;
    }
    return String(value);
  } finally {
    seen.delete(value);
  }
}

/**
 * YAML to JSON with a 2-space indent: one document becomes its value, several become an array. Anchors and aliases are
 * expanded (the package refuses documents that expand too much), comments are dropped and reported, non-string keys
 * become strings, and values JSON cannot hold are an error naming where they are.
 */
export async function yamlToJson(text: string, _ctx: ToolContext): Promise<ToolResult> {
  const parsed = await parseYaml(text);
  if (parsed.error) return { ok: false, ...parsed.error };
  const { visit, isNode } = await import("yaml");
  let hadComments = false;
  for (const doc of parsed.docs) {
    if (doc.commentBefore || doc.comment) hadComments = true;
    visit(doc, (_k, node) => {
      if (isNode(node) && (node.comment || node.commentBefore)) hadComments = true;
    });
  }
  const notes: Notes = { keysConverted: false, bigInts: false };
  let values: Json[];
  try {
    values = parsed.docs.map((d) => toJson(d.toJS({ mapAsMap: true, maxAliasCount: 100 }), "", notes, new Set()));
  } catch (e) {
    if (e instanceof Unrepresentable) return { ok: false, message: e.message };
    const m = e instanceof Error ? e.message : String(e);
    if (/alias/i.test(m)) return { ok: false, message: "This YAML expands too much through aliases to convert (possible alias bomb)" };
    return { ok: false, message: m.split("\n")[0] };
  }
  const result: Json = values.length === 1 ? values[0] : values;
  const warnings: string[] = [];
  if (hadComments) warnings.push("comments were dropped");
  if (notes.keysConverted) warnings.push("keys that were not strings became strings");
  if (notes.bigInts) warnings.push("integers beyond 2^53 may have lost precision");
  return { ok: true, text: withSourceNewline(text, print(result, "")), warnings: warnings.length > 0 ? warnings : undefined };
}
