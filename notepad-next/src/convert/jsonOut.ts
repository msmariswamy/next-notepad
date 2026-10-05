/** An ordered JSON object. Plain objects would reorder integer-like keys, so entries stay in a list until printing. */
export class Obj {
  constructor(public entries: [string, Json][] = []) {}
}
export type Json = null | boolean | number | string | Json[] | Obj;

/** Print like `JSON.stringify(value, null, 2)`, but in the entries' own order. */
export function print(v: Json, indent: string): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  const inner = indent + "  ";
  if (Array.isArray(v)) return v.length === 0 ? "[]" : `[\n${v.map((x) => inner + print(x, inner)).join(",\n")}\n${indent}]`;
  return v.entries.length === 0 ? "{}" : `{\n${v.entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${print(x, inner)}`).join(",\n")}\n${indent}}`;
}
