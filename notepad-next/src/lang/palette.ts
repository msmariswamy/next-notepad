/**
 * Token colours for the light and dark themes. Highlighting uses CSS classes (classHighlighter)
 * coloured through these values, so switching theme restyles every open document without
 * reloading it. palette.test.ts enforces WCAG AA contrast against each theme's background.
 */
export interface Palette {
  background: string;
  text: string;
  tokens: Record<string, string>;
}

export const LIGHT: Palette = {
  background: "#ffffff",
  text: "#1f2328",
  tokens: {
    keyword: "#cf222e",
    "string": "#0a3069",
    number: "#0550ae",
    comment: "#59636e",
    "function": "#6639ba",
    type: "#953800",
    "property": "#0550ae",
    operator: "#1f2328",
    invalid: "#82071e",
    meta: "#59636e",
  },
};

export const DARK: Palette = {
  background: "#1e1e1e",
  text: "#d4d4d4",
  tokens: {
    keyword: "#ff7b72",
    "string": "#a5d6ff",
    number: "#79c0ff",
    comment: "#9198a1",
    "function": "#d2a8ff",
    type: "#ffa657",
    "property": "#79c0ff",
    operator: "#d4d4d4",
    invalid: "#ffa198",
    meta: "#9198a1",
  },
};

/** Map lezer `classHighlighter` classes (tok-*) to palette keys. */
const CLASSES: Record<string, string> = {
  "tok-keyword": "keyword",
  "tok-operatorKeyword": "keyword",
  "tok-controlKeyword": "keyword",
  "tok-string": "string",
  "tok-string2": "string",
  "tok-number": "number",
  "tok-bool": "number",
  "tok-null": "number",
  "tok-atom": "number",
  "tok-comment": "comment",
  "tok-variableName2": "function",
  "tok-typeName": "type",
  "tok-className": "type",
  "tok-propertyName": "property",
  "tok-operator": "operator",
  "tok-invalid": "invalid",
  "tok-meta": "meta",
  "tok-labelName": "function",
};

export function paletteCss(): string {
  const rules = (selector: string, p: Palette) =>
    Object.entries(CLASSES)
      .map(([cls, key]) => `${selector} .${cls} { color: ${p.tokens[key]}; }`)
      .join("\n");
  return `${rules(':root:not([data-theme="dark"])', LIGHT)}\n${rules(':root[data-theme="dark"]', DARK)}\n.tok-comment { font-style: italic; }\n.tok-invalid { text-decoration: underline wavy; }`;
}

export function installPalette(doc: Document = document): void {
  const style = doc.createElement("style");
  style.dataset.palette = "tokens";
  style.textContent = paletteCss();
  doc.head.append(style);
}

// ---- contrast (WCAG 2.x) used by the unit test

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
