import { describe, expect, it } from "vitest";
import { compare, isSemver, nextVersion, readCargoVersion, setCargoLockVersion, setCargoTomlVersion, setJsonVersion, setPackageLockVersion } from "./release-lib.mjs";

describe("nextVersion", () => {
  it("bumps patch, minor and major", () => {
    expect(nextVersion("0.1.0", "patch")).toBe("0.1.1");
    expect(nextVersion("0.1.9", "minor")).toBe("0.2.0");
    expect(nextVersion("1.4.2", "major")).toBe("2.0.0");
  });
  it("accepts an explicit version, with or without a leading v", () => {
    expect(nextVersion("0.1.0", "0.3.0")).toBe("0.3.0");
    expect(nextVersion("0.1.0", "v1.0.0")).toBe("1.0.0");
  });
  it("rejects versions that are not newer", () => {
    expect(() => nextVersion("0.2.0", "0.2.0")).toThrow(/greater/);
    expect(() => nextVersion("0.2.0", "0.1.9")).toThrow(/greater/);
  });
  it("rejects nonsense", () => {
    expect(() => nextVersion("0.1.0", "banana")).toThrow(/patch, minor, major/);
    expect(() => nextVersion("0.1.0", "1.2")).toThrow();
    expect(() => nextVersion("0.1.0", "1.2.3-beta")).toThrow();
    expect(() => nextVersion("oops", "patch")).toThrow(/x\.y\.z/);
  });
  it("compares numerically, not as text", () => {
    expect(compare("0.10.0", "0.9.0")).toBe(1);
    expect(compare("1.0.0", "1.0.0")).toBe(0);
    expect(isSemver("1.2.3")).toBe(true);
    expect(isSemver("v1.2.3")).toBe(false);
  });
});

describe("file updaters", () => {
  it("setJsonVersion changes only the version and keeps a trailing newline", () => {
    const out = setJsonVersion('{\n  "name": "x",\n  "version": "0.1.0"\n}\n', "0.2.0");
    expect(JSON.parse(out)).toEqual({ name: "x", version: "0.2.0" });
    expect(out.endsWith("\n")).toBe(true);
  });

  it("setPackageLockVersion updates both places and can fix the name", () => {
    const lock = JSON.stringify({ name: "old", version: "0.1.0", packages: { "": { name: "old", version: "0.1.0" }, "node_modules/a": { version: "9.9.9" } } });
    const out = JSON.parse(setPackageLockVersion(lock, "0.2.0", "next-notepad"));
    expect(out).toMatchObject({ name: "next-notepad", version: "0.2.0" });
    expect(out.packages[""]).toMatchObject({ name: "next-notepad", version: "0.2.0" });
    expect(out.packages["node_modules/a"].version).toBe("9.9.9");
  });

  const toml = '[package]\nname = "notepad-next"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\ntauri = { version = "2" }\nserde = "1"\n';
  it("setCargoTomlVersion changes the [package] version only", () => {
    const out = setCargoTomlVersion(toml, "0.2.0");
    expect(out).toContain('[package]\nname = "notepad-next"\nversion = "0.2.0"');
    expect(out).toContain('tauri = { version = "2" }');
    expect(readCargoVersion(out)).toBe("0.2.0");
  });
  it("setCargoTomlVersion throws when there is no [package] version", () => {
    expect(() => setCargoTomlVersion("[dependencies]\n", "0.2.0")).toThrow();
  });

  const lock = '[[package]]\nname = "serde"\nversion = "1.0.0"\n\n[[package]]\nname = "notepad-next"\nversion = "0.1.0"\ndependencies = [\n "serde",\n]\n';
  it("setCargoLockVersion changes only this crate", () => {
    const out = setCargoLockVersion(lock, "notepad-next", "0.2.0");
    expect(out).toContain('name = "notepad-next"\nversion = "0.2.0"');
    expect(out).toContain('name = "serde"\nversion = "1.0.0"');
  });
  it("setCargoLockVersion throws for an unknown crate", () => {
    expect(() => setCargoLockVersion(lock, "nope", "1.0.0")).toThrow(/nope/);
  });
});
