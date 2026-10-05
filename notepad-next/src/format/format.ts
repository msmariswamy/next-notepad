import { prettyPrint } from "../json/jsonTools";
import { formatJava } from "./java";
import { formatMarkup } from "./markup";

export interface FormatOptions {
  tabWidth: number;
  useTabs: boolean;
}

export type FormatResult =
  | { ok: true; text: string }
  | { ok: false; message: string; line?: number; column?: number };

export const FORMATTABLE = ["JSON", "JavaScript", "TypeScript", "HTML", "CSS", "XML", "YAML", "Java"] as const;
export const isFormattable = (language: string) => (FORMATTABLE as readonly string[]).includes(language);

const unitOf = (o: FormatOptions) => (o.useTabs ? "\t" : " ".repeat(o.tabWidth));

interface PrettierError {
  message?: string;
  loc?: { start?: { line: number; column: number } };
}

/** Prettier's message embeds a code frame; keep only the first line and the position. */
function fromPrettierError(e: unknown): FormatResult {
  const err = e as PrettierError;
  const first = String(err.message ?? e).split("\n")[0].replace(/\s*\(\d+:\d+\)\s*$/, "");
  const start = err.loc?.start;
  return start ? { ok: false, message: first, line: start.line, column: start.column } : { ok: false, message: first };
}

/** Each formatter is loaded on first use, so none of this code is paid for at start-up (spec: code-formatting). */
async function withPrettier(parser: string, text: string, o: FormatOptions, plugins: () => Promise<unknown[]>): Promise<FormatResult> {
  try {
    const prettier = await import("prettier/standalone");
    const formatted = await prettier.format(text, {
      parser,
      plugins: (await plugins()) as never,
      tabWidth: o.tabWidth,
      useTabs: o.useTabs,
      printWidth: 80,
    });
    return { ok: true, text: formatted.replace(/\n$/, "") };
  } catch (e) {
    return fromPrettierError(e);
  }
}

export async function formatCode(language: string, text: string, o: FormatOptions): Promise<FormatResult> {
  switch (language) {
    case "JSON":
      return prettyPrint(text, unitOf(o));
    case "JavaScript":
      return withPrettier("babel", text, o, async () => [await import("prettier/plugins/babel"), await import("prettier/plugins/estree")]);
    case "TypeScript":
      return withPrettier("typescript", text, o, async () => [await import("prettier/plugins/typescript"), await import("prettier/plugins/estree")]);
    case "CSS":
      return withPrettier("css", text, o, async () => [await import("prettier/plugins/postcss")]);
    case "YAML":
      return withPrettier("yaml", text, o, async () => [await import("prettier/plugins/yaml")]);
    case "HTML":
      return formatMarkup(text, { unit: unitOf(o), html: true });
    case "XML":
      return formatMarkup(text, { unit: unitOf(o), html: false });
    case "Java":
      return formatJava(text, unitOf(o));
    default:
      return { ok: false, message: `No formatter for ${language}` };
  }
}
