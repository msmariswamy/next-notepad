/**
 * Notepad++-style search patterns for the JS engine (ADR-0003).
 * The Rust twin lives in src-tauri/src/regex_compat.rs; both run shared/regex-cases.json.
 */

export type SearchMode = "normal" | "extended" | "regex";

export interface PatternOptions {
  mode: SearchMode;
  matchCase: boolean;
  wholeWord: boolean;
  dotMatchesNewline: boolean;
}

export const DEFAULT_PATTERN_OPTIONS: PatternOptions = {
  mode: "normal",
  matchCase: false,
  wholeWord: false,
  dotMatchesNewline: false,
};

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\\/-]/g, "\\$&");
}

const HEX = /^[0-9a-fA-F]+$/;

/**
 * Expand Extended-mode escapes (\n \r \t \0 \\ \xHH \uHHHH). Unknown escapes keep their backslash.
 */
export function expandExtended(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c !== "\\" || i === text.length - 1) {
      out += c;
      continue;
    }
    const n = text[++i];
    if (n === "n") out += "\n";
    else if (n === "r") out += "\r";
    else if (n === "t") out += "\t";
    else if (n === "0") out += "\0";
    else if (n === "\\") out += "\\";
    else if ((n === "x" || n === "u") && HEX.test(text.slice(i + 1, i + 1 + (n === "x" ? 2 : 4)))) {
      const len = n === "x" ? 2 : 4;
      out += String.fromCharCode(parseInt(text.slice(i + 1, i + 1 + len), 16));
      i += len;
    } else out += "\\" + n;
  }
  return out;
}

/**
 * True when the pattern uses features the Rust `regex` crate lacks (lookaround,
 * backreferences) or semantics only the JS path implements (whole word). Such
 * searches run in the JS engine over file contents read by the backend.
 */
export function needsJsEngine(pattern: string, opts: PatternOptions): boolean {
  if (opts.wholeWord) {
    if (opts.mode === "regex") return true;
    const text = opts.mode === "extended" ? expandExtended(pattern) : pattern;
    return !(/^\w/.test(text) && /\w$/.test(text));
  }
  if (opts.mode !== "regex") return false;
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") {
      const n = pattern[i + 1];
      if (!inClass && n !== undefined && (/[1-9]/.test(n) || n === "k")) return true;
      i++;
    } else if (inClass) {
      if (c === "]") inClass = false;
    } else if (c === "[") {
      inClass = true;
    } else if (c === "(" && pattern[i + 1] === "?") {
      const rest = pattern.slice(i + 2, i + 4);
      if (rest[0] === "=" || rest[0] === "!" || rest[0] === ">" || rest === "<=" || rest === "<!") return true;
    }
  }
  return false;
}

/** Translate Notepad++/PCRE-isms in a regex pattern to JS syntax. */
export function translateRegexToJs(pattern: string): string {
  let out = "";
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") {
      const n = pattern[i + 1];
      if (n === undefined) {
        out += c;
        break;
      }
      i++;
      if (n === "h") out += inClass ? " \\t" : "[ \\t]";
      else if (n === "R" && !inClass) out += "(?:\\r\\n|\\n|\\r)";
      else if (n === "A" && !inClass) out += "(?<![\\s\\S])";
      else if (n === "z" && !inClass) out += "(?![\\s\\S])";
      else if (n === "Z" && !inClass) out += "(?=\\n?(?![\\s\\S]))";
      else if (n === "x" && pattern[i + 1] === "{") {
        const end = pattern.indexOf("}", i + 2);
        const hex = end > 0 ? pattern.slice(i + 2, end) : "";
        if (HEX.test(hex)) {
          const cp = parseInt(hex, 16);
          const lit = cp > 0xffff ? String.fromCodePoint(cp).split("").map(u) .join("") : u(String.fromCharCode(cp));
          out += cp > 0xffff && !inClass ? `(?:${lit})` : lit;
          i = end;
        } else out += "\\x";
      } else out += "\\" + n;
    } else if (inClass) {
      out += c;
      if (c === "]") inClass = false;
    } else if (c === "[") {
      inClass = true;
      out += c;
      // A leading ] or ^] is literal inside a class; copy it through unchanged.
      if (pattern[i + 1] === "^") out += pattern[++i];
      if (pattern[i + 1] === "]") out += pattern[++i];
    } else if (c === "(" && pattern.startsWith("?P<", i + 1)) {
      out += "(?<";
      i += 3;
    } else if (c === "(" && pattern.startsWith("?P=", i + 1)) {
      const end = pattern.indexOf(")", i);
      out += `\\k<${pattern.slice(i + 4, end)}>`;
      i = end;
    } else out += c;
  }
  return out;
}

const u = (ch: string) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0");

/** Build the JS RegExp for a search; throws SyntaxError for an invalid pattern. */
export function toJsRegExp(pattern: string, opts: PatternOptions, extraFlags = "g"): RegExp {
  let source: string;
  if (opts.mode === "normal") source = escapeRegex(pattern);
  else if (opts.mode === "extended") source = escapeRegex(expandExtended(pattern));
  else source = translateRegexToJs(pattern);
  if (opts.wholeWord) source = `(?<!\\w)(?:${source})(?!\\w)`;
  let flags = "m" + extraFlags;
  if (!opts.matchCase) flags += "i";
  if (opts.mode === "regex" && opts.dotMatchesNewline) flags += "s";
  return new RegExp(source, flags);
}

/**
 * Expand a replacement template for one match. `groups[0]` is the whole match;
 * missing groups expand to "".
 * - normal: literal text.
 * - extended: \n \r \t \0 \xHH \\ escapes, no group references.
 * - regex: \0-\9 and $0-$9 (single digit), plus \n \r \t \\.
 */
export function expandReplacement(
  template: string,
  groups: ReadonlyArray<string | undefined>,
  mode: SearchMode,
): string {
  if (mode === "normal") return template;
  if (mode === "extended") return expandExtended(template);
  let out = "";
  for (let i = 0; i < template.length; i++) {
    const c = template[i];
    if (c === "$" && /[0-9]/.test(template[i + 1] ?? "")) {
      out += groups[Number(template[++i])] ?? "";
    } else if (c === "\\" && i + 1 < template.length) {
      const n = template[++i];
      if (/[0-9]/.test(n)) out += groups[Number(n)] ?? "";
      else if (n === "n") out += "\n";
      else if (n === "r") out += "\r";
      else if (n === "t") out += "\t";
      else if (n === "\\") out += "\\";
      else out += "\\" + n;
    } else out += c;
  }
  return out;
}
