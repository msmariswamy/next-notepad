import { describe, expect, it } from "vitest";
import { eolLabel, formatStatus, type StatusInfo } from "./status";

const base: StatusInfo = {
  line: 3,
  column: 5,
  selectionLength: 0,
  selectionLines: 0,
  length: 42,
  lines: 7,
  eol: "lf",
  encoding: "UTF-8",
  language: "JSON",
};

describe("status bar", () => {
  it("shows line and column", () => {
    expect(formatStatus(base)[2]).toContain("Ln: 3");
    expect(formatStatus(base)[2]).toContain("Col: 5");
  });

  it("shows selection length and line count", () => {
    const text = formatStatus({ ...base, selectionLength: 10, selectionLines: 2 })[2];
    expect(text).toContain("Sel: 10 | 2");
  });

  it("shows document length and lines", () => {
    expect(formatStatus(base)[1]).toBe("length: 42   lines: 7");
  });

  it("labels each line ending", () => {
    expect(eolLabel("lf")).toBe("Unix (LF)");
    expect(eolLabel("crlf")).toBe("Windows (CR LF)");
    expect(eolLabel("cr")).toBe("Mac (CR)");
  });

  it("includes encoding and language", () => {
    const segs = formatStatus(base);
    expect(segs[0]).toBe("JSON");
    expect(segs[4]).toBe("UTF-8");
  });
});
