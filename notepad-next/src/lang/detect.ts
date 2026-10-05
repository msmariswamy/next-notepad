import { validate } from "../json/jsonTools";

/** Only this much of a document is examined, so typing in huge files is never slowed (spec: language-detection). */
export const DETECT_PREFIX_BYTES = 64 * 1024;

const HTML_TAGS = /^<(?:!doctype\s+html|html|head|body|div|span|p|a|ul|ol|li|table|tr|td|th|h[1-6]|img|br|hr|form|input|button|script|style|link|meta|title|section|article|nav|header|footer|main|label|select|option|textarea|pre|code|em|strong|b|i)\b/i;

function looksLikeJson(sample: string, whole: boolean): boolean {
  const first = sample[0];
  if (first !== "{" && first !== "[") return false;
  // A complete, valid document of any shape.
  if (whole && validate(sample).ok) return first === "{" || /^\[\s*(\{|\[|"|-?\d|true|false|null|\])/.test(sample);
  // Otherwise by shape, so JSON with a typo is still highlighted: {"key": ... or an array of values/objects.
  if (first === "{") return /^\{\s*("(?:[^"\\\n]|\\.)*"\s*:|\})/.test(sample);
  return /^\[\s*(\{\s*"|\[|"(?:[^"\\\n]|\\.)*"\s*[,\]]|-?\d+(?:\.\d+)?\s*,|\])/.test(sample);
}

function looksLikeMarkup(sample: string): "HTML" | "XML" | null {
  if (!sample.startsWith("<")) return null;
  if (/^<\?xml\b/i.test(sample)) return "XML";
  if (HTML_TAGS.test(sample)) return "HTML";
  // A generic element with a matching close tag (or a self-closing root) reads as XML.
  const open = /^<([A-Za-z_][\w.:-]*)(?:\s[^>]*)?(\/?)>/.exec(sample);
  if (!open) return null;
  if (open[2] === "/") return "XML";
  return sample.includes(`</${open[1]}>`) ? "XML" : null;
}

const JAVA_SIGNALS = /(?:^|\n)\s*(?:package\s+[\w.]+\s*;|import\s+(?:static\s+)?[\w.*]+\s*;)|\bpublic\s+(?:static\s+)?(?:final\s+)?(?:class|interface|enum|record)\s+\w+|\bpublic\s+static\s+void\s+main\s*\(|\bSystem\.(?:out|err)\.print|@Override\b|\b(?:private|protected)\s+(?:static\s+)?(?:final\s+)?[\w<>[\],\s]+\s+\w+\s*\([^)]*\)\s*(?:throws\s+[\w., ]+)?\s*\{/;

function looksLikeJava(sample: string): boolean {
  if (!JAVA_SIGNALS.test(sample)) return false;
  // Java has braces or statements ending in semicolons; this keeps "import x;" in prose out.
  return sample.includes("{") || /;\s*(\n|$)/.test(sample);
}

function looksLikeYaml(sample: string): boolean {
  const lines = sample.split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) return false;
  if (/^---\s*$/.test(lines[0])) return true;
  const key = /^\s*[A-Za-z_][\w .-]*:(\s+\S.*|\s*)$/;
  const item = /^\s*-\s+\S/;
  const comment = /^\s*#/;
  const continuation = /^\s{2,}\S/;
  let score = 0;
  let structured = 0;
  for (const l of lines) {
    if (key.test(l) && !/^\s*[A-Za-z_][\w .-]*:\s+\S.*\s[A-Za-z]+\s.*[.!?]$/.test(l)) {
      score++;
      structured++;
    } else if (item.test(l)) {
      score++;
      structured++;
    } else if (comment.test(l) || continuation.test(l)) score++;
  }
  // Mostly YAML-shaped lines and at least two real key/list lines.
  return structured >= 2 && score / lines.length >= 0.75;
}

/**
 * Guess a language from the text alone: JSON, XML, HTML, YAML or Java; null when nothing fits.
 * Only the first DETECT_PREFIX_BYTES characters are examined.
 */
export function detectFromContent(text: string): string | null {
  const whole = text.length <= DETECT_PREFIX_BYTES;
  const sample = text.slice(0, DETECT_PREFIX_BYTES).trim();
  if (sample === "") return null;
  if (looksLikeJson(sample, whole)) return "JSON";
  const markup = looksLikeMarkup(sample);
  if (markup) return markup;
  if (looksLikeJava(sample)) return "Java";
  if (looksLikeYaml(sample)) return "YAML";
  return null;
}
