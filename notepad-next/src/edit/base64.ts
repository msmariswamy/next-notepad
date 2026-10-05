export type Base64Result = { ok: true; text: string } | { ok: false; message: string };

const CHUNK = 0x8000;
const STANDARD = /^[A-Za-z0-9+/]*$/;
const URL_SAFE = /^[A-Za-z0-9\-_]*$/;

/** Encode text as UTF-8 base64 (spec: base64-transform). The URL-safe variant swaps "+/" for "-_" and keeps padding. */
export function encode(text: string, urlSafe = false): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  // Chunked so String.fromCharCode never receives enough arguments to overflow the stack.
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  const out = btoa(binary);
  return urlSafe ? out.replace(/\+/g, "-").replace(/\//g, "_") : out;
}

/**
 * Decode base64 to UTF-8 text. Whitespace is ignored and missing padding tolerated; anything else
 * outside the chosen alphabet, or bytes that are not valid UTF-8, is an error so the caller can leave the text untouched.
 */
export function decode(input: string, urlSafe = false): Base64Result {
  const body = input.replace(/\s+/g, "").replace(/=+$/, "");
  if (!(urlSafe ? URL_SAFE : STANDARD).test(body) || body.length % 4 === 1) {
    return { ok: false, message: "Input is not valid base64" };
  }
  const std = urlSafe ? body.replace(/-/g, "+").replace(/_/g, "/") : body;
  const binary = atob(std.padEnd(Math.ceil(std.length / 4) * 4, "="));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  try {
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, message: "Decoded bytes are not valid UTF-8" };
  }
}
