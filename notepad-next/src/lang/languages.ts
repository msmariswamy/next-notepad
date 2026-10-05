import type { Extension } from "@codemirror/state";

export const PLAIN_TEXT = "Normal text";

export interface LanguageDef {
  name: string;
  /** File extensions without the dot, lower-case. */
  extensions: string[];
  /** Loaded on demand so unused grammars stay out of the startup bundle. */
  load: () => Promise<Extension>;
}

export const LANGUAGES: LanguageDef[] = [
  { name: PLAIN_TEXT, extensions: ["txt", "text", "log"], load: async () => [] },
  { name: "JSON", extensions: ["json", "jsonc", "geojson", "webmanifest"], load: async () => [(await import("@codemirror/lang-json")).json(), (await import("../editor/jsonErrors")).jsonErrorMarks()] },
  { name: "JavaScript", extensions: ["js", "mjs", "cjs", "jsx"], load: async () => (await import("@codemirror/lang-javascript")).javascript({ jsx: true }) },
  { name: "TypeScript", extensions: ["ts", "mts", "cts", "tsx"], load: async () => (await import("@codemirror/lang-javascript")).javascript({ typescript: true, jsx: true }) },
  { name: "HTML", extensions: ["html", "htm", "xhtml"], load: async () => (await import("@codemirror/lang-html")).html() },
  { name: "CSS", extensions: ["css", "scss", "less"], load: async () => (await import("@codemirror/lang-css")).css() },
  { name: "XML", extensions: ["xml", "svg", "plist", "xsd", "xsl", "xslt", "csproj", "pom"], load: async () => (await import("@codemirror/lang-xml")).xml() },
  { name: "Markdown", extensions: ["md", "markdown", "mdown"], load: async () => (await import("@codemirror/lang-markdown")).markdown() },
  { name: "YAML", extensions: ["yaml", "yml"], load: async () => (await import("@codemirror/lang-yaml")).yaml() },
  { name: "Python", extensions: ["py", "pyw", "pyi"], load: async () => (await import("@codemirror/lang-python")).python() },
  { name: "Java", extensions: ["java"], load: async () => (await import("@codemirror/lang-java")).java() },
  { name: "C", extensions: ["c", "h"], load: async () => (await import("@codemirror/lang-cpp")).cpp() },
  { name: "C++", extensions: ["cpp", "cc", "cxx", "hpp", "hh", "hxx"], load: async () => (await import("@codemirror/lang-cpp")).cpp() },
  { name: "Rust", extensions: ["rs"], load: async () => (await import("@codemirror/lang-rust")).rust() },
  { name: "Go", extensions: ["go"], load: async () => (await import("@codemirror/lang-go")).go() },
  {
    name: "Shell",
    extensions: ["sh", "bash", "zsh", "ksh"],
    load: async () => {
      const [{ StreamLanguage }, { shell }] = await Promise.all([import("@codemirror/language"), import("@codemirror/legacy-modes/mode/shell")]);
      return StreamLanguage.define(shell);
    },
  },
  { name: "SQL", extensions: ["sql"], load: async () => (await import("@codemirror/lang-sql")).sql() },
];

const BY_NAME = new Map(LANGUAGES.map((l) => [l.name, l]));
const BY_EXTENSION = new Map(LANGUAGES.flatMap((l) => l.extensions.map((e) => [e, l.name] as const)));

/** Language for a file path by extension; unknown extensions and untitled documents are plain text. */
export function detectLanguage(path: string | null): string {
  if (!path) return PLAIN_TEXT;
  const file = path.split(/[\\/]/).pop() ?? "";
  const dot = file.lastIndexOf(".");
  if (dot <= 0) return PLAIN_TEXT; // no extension, or a dotfile like ".gitignore"
  return BY_EXTENSION.get(file.slice(dot + 1).toLowerCase()) ?? PLAIN_TEXT;
}

/** True when the file name's extension is one of the registered ones (even for plain text such as .txt). */
export function hasRecognisedExtension(path: string | null): boolean {
  if (!path) return false;
  const file = path.split(/[\\/]/).pop() ?? "";
  const dot = file.lastIndexOf(".");
  return dot > 0 && BY_EXTENSION.has(file.slice(dot + 1).toLowerCase());
}

const cache = new Map<string, Promise<Extension>>();

/** Highlighting extension for a language name (cached); unknown names fall back to plain text. */
export function loadLanguageExtension(name: string): Promise<Extension> {
  const def = BY_NAME.get(name) ?? BY_NAME.get(PLAIN_TEXT)!;
  let ext = cache.get(def.name);
  if (!ext) cache.set(def.name, (ext = def.load()));
  return ext;
}
