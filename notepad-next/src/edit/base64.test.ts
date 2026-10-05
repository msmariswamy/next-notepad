import { describe, expect, it } from "vitest";
import { decode, encode } from "./base64";

describe("encode", () => {
  it("encodes ASCII", () => {
    expect(encode("Hello")).toBe("SGVsbG8=");
  });

  it("encodes the empty string as empty", () => {
    expect(encode("")).toBe("");
  });

  it("encodes non-ASCII text as UTF-8", () => {
    expect(encode("héllo €")).toBe("aMOpbGxvIOKCrA==");
  });

  it("uses the URL-safe alphabet when asked", () => {
    expect(encode("ÿþ?>", false)).toContain("+");
    const url = encode("ÿþ?>", true);
    expect(url).not.toMatch(/[+/]/);
    expect(url).toMatch(/[-_]/);
  });

  it("handles large input without overflowing the stack", () => {
    const big = "a".repeat(500_000);
    expect(decode(encode(big))).toEqual({ ok: true, text: big });
  });
});

describe("decode", () => {
  it("decodes ASCII", () => {
    expect(decode("SGVsbG8=")).toEqual({ ok: true, text: "Hello" });
  });

  it("round-trips non-ASCII text in both variants", () => {
    for (const urlSafe of [false, true]) {
      expect(decode(encode("héllo €", urlSafe), urlSafe)).toEqual({ ok: true, text: "héllo €" });
    }
  });

  it("round-trips the URL-safe alphabet", () => {
    const text = "ÿþ?>";
    expect(decode(encode(text, true), true)).toEqual({ ok: true, text });
  });

  it("ignores whitespace and line breaks", () => {
    expect(decode("SGVs\n bG8=\r\n")).toEqual({ ok: true, text: "Hello" });
  });

  it("accepts missing padding", () => {
    expect(decode("SGVsbG8")).toEqual({ ok: true, text: "Hello" });
  });

  it("decodes the empty string to empty", () => {
    expect(decode("  ")).toEqual({ ok: true, text: "" });
  });

  it("rejects characters outside the alphabet", () => {
    const r = decode("not base64!");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/not valid base64/i);
  });

  it("rejects URL-safe characters in the standard variant and vice versa", () => {
    expect(decode("a-b_", false).ok).toBe(false);
    expect(decode("a+b/", true).ok).toBe(false);
  });

  it("rejects an impossible length", () => {
    expect(decode("abcde").ok).toBe(false);
  });

  it("rejects bytes that are not valid UTF-8", () => {
    const r = decode("/w=="); // 0xFF
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/not valid UTF-8/i);
  });
});
