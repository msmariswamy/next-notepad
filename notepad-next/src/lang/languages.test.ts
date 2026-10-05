import { describe, expect, it } from "vitest";
import { language } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { LANGUAGES, PLAIN_TEXT, detectLanguage, loadLanguageExtension } from "./languages";

describe("detectLanguage", () => {
  it("maps common extensions", () => {
    const cases: Record<string, string> = {
      "/a/data.json": "JSON",
      "main.rs": "Rust",
      "app.TS": "TypeScript",
      "index.html": "HTML",
      "style.css": "CSS",
      "README.md": "Markdown",
      "x.py": "Python",
      "Main.java": "Java",
      "a.c": "C",
      "a.cpp": "C++",
      "main.go": "Go",
      "run.sh": "Shell",
      "q.sql": "SQL",
      "c.yml": "YAML",
      "f.xml": "XML",
      "x.js": "JavaScript",
    };
    for (const [path, lang] of Object.entries(cases)) expect(detectLanguage(path), path).toBe(lang);
  });

  it("falls back to plain text for unknown extensions, no extension, dotfiles and untitled", () => {
    expect(detectLanguage("a.unknownext")).toBe(PLAIN_TEXT);
    expect(detectLanguage("Makefile")).toBe(PLAIN_TEXT);
    expect(detectLanguage(".gitignore")).toBe(PLAIN_TEXT);
    expect(detectLanguage(null)).toBe(PLAIN_TEXT);
  });

  it("handles Windows paths", () => {
    expect(detectLanguage("C:\\proj\\data.json")).toBe("JSON");
  });

  it("covers every language the spec lists", () => {
    const names = LANGUAGES.map((l) => l.name);
    for (const required of ["Normal text", "JSON", "JavaScript", "TypeScript", "HTML", "CSS", "XML", "Markdown", "YAML", "Python", "Java", "C", "C++", "Rust", "Go", "Shell", "SQL"]) {
      expect(names).toContain(required);
    }
  });

  it("has unique names and no extension claimed twice", () => {
    expect(new Set(LANGUAGES.map((l) => l.name)).size).toBe(LANGUAGES.length);
    const exts = LANGUAGES.flatMap((l) => l.extensions);
    expect(new Set(exts).size).toBe(exts.length);
  });
});

describe("loadLanguageExtension", () => {
  it("every language loads and installs a grammar (except plain text)", async () => {
    for (const l of LANGUAGES) {
      const ext = await loadLanguageExtension(l.name);
      const state = EditorState.create({ doc: "x", extensions: [ext] });
      const lang = state.facet(language);
      if (l.name === PLAIN_TEXT) expect(lang).toBeNull();
      else expect(lang, l.name).not.toBeNull();
    }
  });

  it("falls back to plain text for an unknown name", async () => {
    const state = EditorState.create({ doc: "x", extensions: [await loadLanguageExtension("Klingon")] });
    expect(state.facet(language)).toBeNull();
  });

  it("caches the loaded extension", () => {
    expect(loadLanguageExtension("JSON")).toBe(loadLanguageExtension("JSON"));
  });
});
