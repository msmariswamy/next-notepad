import { validateXml } from "./tokens";

/** Documents larger than this are not checked while typing (checking is O(n)), the same limit JSON uses. */
export const XML_ERROR_MAX_CHARS = 1_000_000;

/** Range to underline for the first well-formedness error, or null when valid, blank or too large. */
export function xmlErrorRange(text: string): { from: number; to: number } | null {
  if (text.length > XML_ERROR_MAX_CHARS || text.trim() === "") return null;
  const r = validateXml(text);
  if (r.ok) return null;
  // An error at the very end of the input has no character to cover, so underline the last one.
  if (r.offset >= text.length) return { from: Math.max(0, text.length - 1), to: text.length };
  return { from: r.offset, to: r.offset + 1 };
}
