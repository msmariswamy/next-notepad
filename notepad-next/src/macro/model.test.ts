import { describe, expect, it } from "vitest";
import { MACRO_FILE_VERSION, describeStep, emptyMacroFile, parseMacroFile, serializeMacroFile, type Macro } from "./model";

const sample: Macro = {
  name: "cleanup",
  steps: [
    { type: "text", insert: "abc", before: 0, after: 0 },
    { type: "command", id: "line.moveDown" },
    { type: "command", id: "find.replaceAll", args: { state: { pattern: "a+", replacement: "x" } } },
  ],
};

describe("macro file", () => {
  it("starts empty at the current version", () => {
    expect(emptyMacroFile()).toEqual({ version: MACRO_FILE_VERSION, macros: [] });
    expect(MACRO_FILE_VERSION).toBe(1);
  });

  it("round-trips through JSON", () => {
    const file = { version: 1 as const, macros: [sample, { name: "second", shortcut: "Ctrl+Shift+1", steps: [] }] };
    expect(parseMacroFile(JSON.parse(serializeMacroFile(file)))).toEqual(file);
  });

  it("serializes with a version field", () => {
    expect(JSON.parse(serializeMacroFile({ version: 1, macros: [] }))).toEqual({ version: 1, macros: [] });
  });

  it("treats a missing or non-object file as empty", () => {
    expect(parseMacroFile(null)).toEqual(emptyMacroFile());
    expect(parseMacroFile(undefined)).toEqual(emptyMacroFile());
    expect(parseMacroFile("nope")).toEqual(emptyMacroFile());
    expect(parseMacroFile({})).toEqual(emptyMacroFile());
  });

  it("rejects a version it does not understand", () => {
    expect(() => parseMacroFile({ version: 2, macros: [] })).toThrow(/version/i);
  });

  it("drops malformed macros and keeps the valid ones", () => {
    const raw = {
      version: 1,
      macros: [
        sample,
        { name: "", steps: [] },
        { name: "no steps" },
        { name: "bad step", steps: [{ type: "text", insert: 5, before: 0, after: 0 }] },
        { name: "bad type", steps: [{ type: "explode" }] },
        { name: "negative", steps: [{ type: "text", insert: "x", before: -1, after: 0 }] },
        "junk",
        null,
      ],
    };
    expect(parseMacroFile(raw).macros).toEqual([sample]);
  });

  it("drops a duplicate name after the first", () => {
    const raw = { version: 1, macros: [sample, { ...sample, steps: [] }] };
    expect(parseMacroFile(raw).macros).toHaveLength(1);
  });

  it("ignores unknown extra fields on steps and macros", () => {
    const raw = { version: 1, macros: [{ ...sample, extra: true, steps: [{ type: "command", id: "x", more: 1 }] }] };
    expect(parseMacroFile(raw).macros[0]).toEqual({ name: "cleanup", steps: [{ type: "command", id: "x" }] });
  });
});

describe("describeStep", () => {
  it("names text and command steps for messages", () => {
    expect(describeStep({ type: "text", insert: "abc", before: 0, after: 0 })).toBe('type "abc"');
    expect(describeStep({ type: "text", insert: "", before: 1, after: 0 })).toBe("delete");
    expect(describeStep({ type: "command", id: "line.moveDown" })).toBe("line.moveDown");
    expect(describeStep({ type: "command", id: "line.moveDown" }, (id) => (id === "line.moveDown" ? "Move Down Current Line" : id))).toBe("Move Down Current Line");
  });

  it("shortens long text", () => {
    expect(describeStep({ type: "text", insert: "x".repeat(40), before: 0, after: 0 })).toBe(`type "${"x".repeat(20)}…"`);
  });
});
