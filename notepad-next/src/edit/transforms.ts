/** Pure text transforms behind the Edit menu (spec: text-transforms). All operate on LF-normalised text. */

// ---------------------------------------------------------------- case

export type CaseMode = "upper" | "lower" | "proper" | "properBlend" | "sentence" | "sentenceBlend" | "invert" | "random";

const WORD = /\p{L}[\p{L}\p{N}'’]*/gu;

const capitalise = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** Capitalise the first letter after the start of the text and after . ! ? plus whitespace. */
function sentenceStarts(text: string): string {
  return text.replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (_m, lead: string, ch: string) => lead + ch.toUpperCase());
}

export function convertCase(text: string, mode: CaseMode, rng: () => number = Math.random): string {
  switch (mode) {
    case "upper":
      return text.toUpperCase();
    case "lower":
      return text.toLowerCase();
    case "proper":
      return text.replace(WORD, (w) => capitalise(w.toLowerCase()));
    case "properBlend":
      return text.replace(WORD, capitalise);
    case "sentence":
      return sentenceStarts(text.toLowerCase());
    case "sentenceBlend":
      return sentenceStarts(text);
    case "invert":
      return [...text].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join("");
    case "random":
      return [...text].map((c) => (rng() < 0.5 ? c.toUpperCase() : c.toLowerCase())).join("");
  }
}

// ---------------------------------------------------------------- lines

export const duplicateLines = (lines: string[]): string[] => [...lines, ...lines];

export function removeDuplicateLines(lines: string[]): string[] {
  const seen = new Set<string>();
  return lines.filter((l) => (seen.has(l) ? false : (seen.add(l), true)));
}

export const removeConsecutiveDuplicateLines = (lines: string[]): string[] => lines.filter((l, i) => i === 0 || l !== lines[i - 1]);

export const joinLines = (lines: string[]): string[] => [lines.join(" ")];

/** Wrap each line at `width`, preferring spaces; words longer than the width are cut hard. */
export function splitLines(lines: string[], width: number): string[] {
  const out: string[] = [];
  for (let line of lines) {
    while (line.length > width) {
      const space = line.lastIndexOf(" ", width);
      if (space > 0) {
        out.push(line.slice(0, space));
        line = line.slice(space + 1);
      } else {
        out.push(line.slice(0, width));
        line = line.slice(width);
      }
    }
    out.push(line);
  }
  return out;
}

export function removeEmptyLines(lines: string[], includeBlank: boolean): string[] {
  return lines.filter((l) => (includeBlank ? l.trim() !== "" : l !== ""));
}

export function insertBlank(lines: string[], index: number, where: "above" | "below"): string[] {
  const at = where === "above" ? index : index + 1;
  return [...lines.slice(0, at), "", ...lines.slice(at)];
}

export const reverseLines = (lines: string[]): string[] => [...lines].reverse();

export function randomizeLines(lines: string[], rng: () => number = Math.random): string[] {
  const out = [...lines];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------- sorting

export type SortKind = "lex" | "lexIgnoreCase" | "locale" | "integer" | "decimalComma" | "decimalDot" | "length";

const collator = new Intl.Collator(undefined, { sensitivity: "variant", numeric: false });

/** Sort key: a string compared by code unit, or a number; non-numeric lines get -Infinity so they sort first. */
function keyFor(kind: SortKind): (line: string) => string | number {
  switch (kind) {
    case "lex":
      return (l) => l;
    case "lexIgnoreCase":
      return (l) => l.toLowerCase();
    case "locale":
      return (l) => l;
    case "integer":
      return (l) => {
        const m = /^\s*([-+]?\d+)/.exec(l);
        return m ? Number(m[1]) : -Infinity;
      };
    case "decimalComma":
      return (l) => {
        const n = parseFloat(l.trim().replace(/\./g, "").replace(",", "."));
        return Number.isNaN(n) ? -Infinity : n;
      };
    case "decimalDot":
      return (l) => {
        const n = parseFloat(l.trim().replace(/,/g, ""));
        return Number.isNaN(n) ? -Infinity : n;
      };
    case "length":
      return (l) => l.length;
  }
}

/** Stable sort (Array.prototype.sort is stable); equal keys keep their original order in both directions. */
export function sortLines(lines: string[], kind: SortKind, dir: "asc" | "desc"): string[] {
  const key = keyFor(kind);
  const cmp = (a: string, b: string): number => {
    const ka = key(a);
    const kb = key(b);
    let r: number;
    if (typeof ka === "number" && typeof kb === "number") r = ka === kb ? 0 : ka < kb ? -1 : 1;
    else if (kind === "locale") r = collator.compare(a, b);
    else r = ka < kb ? -1 : ka > kb ? 1 : 0;
    return dir === "asc" ? r : -r;
  };
  return [...lines].sort(cmp);
}

// ---------------------------------------------------------------- blanks

const perLine = (text: string, fn: (line: string) => string) => text.split("\n").map(fn).join("\n");

export const trimTrailing = (text: string) => perLine(text, (l) => l.replace(/[ \t]+$/, ""));
export const trimLeading = (text: string) => perLine(text, (l) => l.replace(/^[ \t]+/, ""));
export const trimBoth = (text: string) => perLine(text, (l) => l.replace(/^[ \t]+|[ \t]+$/g, ""));
export const eolToSpace = (text: string) => text.replace(/\r?\n/g, " ");
export const trimBothAndEol = (text: string) => trimBoth(text).split("\n").join(" ");

export function tabToSpace(text: string, tabWidth: number): string {
  return perLine(text, (line) => {
    let col = 0;
    let out = "";
    for (const ch of line) {
      if (ch === "\t") {
        const n = tabWidth - (col % tabWidth);
        out += " ".repeat(n);
        col += n;
      } else {
        out += ch;
        col++;
      }
    }
    return out;
  });
}

/** Leading indentation only: each full tab stop of spaces becomes a tab; a remainder stays as spaces. */
export function spaceToTabLeading(text: string, tabWidth: number): string {
  return perLine(text, (line) => {
    const m = /^ +/.exec(line);
    if (!m) return line;
    const tabs = Math.floor(m[0].length / tabWidth);
    return "\t".repeat(tabs) + " ".repeat(m[0].length % tabWidth) + line.slice(m[0].length);
  });
}

/** Any run of two or more spaces: the part that reaches a tab stop becomes a tab, the rest is kept. */
export function spaceToTabAll(text: string, tabWidth: number): string {
  return perLine(text, (line) => {
    let out = "";
    let col = 0;
    for (let i = 0; i < line.length; ) {
      if (line[i] !== " ") {
        out += line[i];
        col += line[i] === "\t" ? tabWidth - (col % tabWidth) : 1;
        i++;
        continue;
      }
      let end = i;
      while (line[end] === " ") end++;
      let pos = col;
      const runEnd = col + (end - i);
      while (pos < runEnd) {
        const stop = pos + (tabWidth - (pos % tabWidth));
        if (stop <= runEnd && stop - pos >= 2) {
          out += "\t";
        } else {
          out += " ".repeat(Math.min(stop, runEnd) - pos);
        }
        pos = Math.min(stop, runEnd);
      }
      col = runEnd;
      i = end;
    }
    return out;
  });
}
