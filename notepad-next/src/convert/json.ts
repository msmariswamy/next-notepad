import { validate } from "../json/jsonTools";
import type { ToolResult } from "../tools/runTool";

/**
 * JSON read as ordered data: objects are Maps (so key order survives even for keys like "1") and integers beyond
 * 2^53 are bigints (so their digits survive). Errors carry the JSON tools' line and column.
 */
export async function readJson(text: string): Promise<{ ok: true; value: unknown } | Extract<ToolResult, { ok: false }>> {
  const v = validate(text);
  if (!v.ok) return { ok: false, message: v.message, line: v.line, column: v.column, offset: v.offset };
  const { parseDocument } = await import("yaml");
  // JSON is a subset of YAML 1.2, so the YAML parser reads it, with the two options above.
  const doc = parseDocument(text, { intAsBigInt: true, version: "1.2" });
  const e = doc.errors[0];
  if (e) return { ok: false, message: e.message.split("\n")[0], line: e.linePos?.[0].line, column: e.linePos?.[0].col };
  return { ok: true, value: doc.toJS({ mapAsMap: true }) };
}

/** A parsed value that is a plain ordered object. */
export const isMap = (v: unknown): v is Map<unknown, unknown> => v instanceof Map;

/** Keep the source's trailing newline (or lack of one) on converted text, as the formatters do. */
export const withSourceNewline = (source: string, out: string): string => (/\n$/.test(source) ? out.replace(/\n*$/, "\n") : out.replace(/\n+$/, ""));
