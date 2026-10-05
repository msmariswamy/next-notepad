import { describe, expect, it } from "vitest";
import { formatAccelerator, matchesAccelerator, parseAccelerator } from "./accelerators";

const ev = (over: Partial<Parameters<typeof matchesAccelerator>[0]>) => ({ key: "", code: "", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...over });

describe("accelerators", () => {
  it("parses modifiers and key", () => {
    expect(parseAccelerator("Mod+Shift+F")).toEqual({ key: "f", mod: true, shift: true, alt: false });
    expect(parseAccelerator("F2")).toEqual({ key: "f2", mod: false, shift: false, alt: false });
  });

  it("matches Cmd or Ctrl for Mod", () => {
    expect(matchesAccelerator(ev({ key: "s", metaKey: true }), "Mod+S")).toBe(true);
    expect(matchesAccelerator(ev({ key: "s", ctrlKey: true }), "Mod+S")).toBe(true);
    expect(matchesAccelerator(ev({ key: "s" }), "Mod+S")).toBe(false);
  });

  it("requires the exact modifier set", () => {
    expect(matchesAccelerator(ev({ key: "s", metaKey: true, shiftKey: true }), "Mod+S")).toBe(false);
    expect(matchesAccelerator(ev({ key: "S", metaKey: true, shiftKey: true }), "Mod+Shift+S")).toBe(true);
  });

  it("matches function keys without modifiers", () => {
    expect(matchesAccelerator(ev({ key: "F2" }), "F2")).toBe(true);
    expect(matchesAccelerator(ev({ key: "F2", shiftKey: true }), "F2")).toBe(false);
    expect(matchesAccelerator(ev({ key: "F2", shiftKey: true }), "Shift+F2")).toBe(true);
  });

  it("falls back to the physical key when Alt changes the reported key (macOS Option)", () => {
    expect(matchesAccelerator(ev({ key: "∆", code: "KeyJ", metaKey: true, altKey: true }), "Mod+Alt+J")).toBe(true);
  });

  it("formats for macOS and other platforms", () => {
    expect(formatAccelerator("Mod+Shift+S", true)).toBe("⇧⌘S");
    expect(formatAccelerator("Mod+Shift+S", false)).toBe("Ctrl+Shift+S");
    expect(formatAccelerator("F2", false)).toBe("F2");
    expect(formatAccelerator("Mod+,", true)).toBe("⌘,");
  });
});
