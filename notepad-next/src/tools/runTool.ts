import type { App } from "../app/app";
import { PLAIN_TEXT } from "../lang/languages";

export type ToolResult =
  | { ok: true; text: string; /** Replaces the default success toast (for example "XML is valid"). */ message?: string; warnings?: string[] }
  | { ok: false; message: string; line?: number; column?: number; offset?: number };

export interface ToolContext {
  /** True when the transform got the selection rather than the whole document. */
  selection: boolean;
}

export interface ToolSpec {
  /** Language a Normal text tab switches to after a successful run. */
  language: string;
  success: string;
  /** Prefix for error toasts, for example "Cannot compact XML". */
  errorPrefix?: string;
  /** Validate and similar: report only, never change the document. */
  inspectOnly?: boolean;
  run: (text: string, ctx: ToolContext) => ToolResult | Promise<ToolResult>;
}

export interface ConvertSpec {
  /** Language of the new tab. */
  target: string;
  success: string;
  errorPrefix?: string;
  run: (text: string, ctx: ToolContext) => ToolResult | Promise<ToolResult>;
}

interface Source {
  id: string;
  from: number;
  to: number;
  text: string;
  selection: boolean;
}

function source(app: App): Source | null {
  const doc = app.manager.active;
  if (!doc) return null;
  const sel = app.getSelection();
  const selection = sel.from !== sel.to;
  const range = selection ? sel : { from: 0, to: app.view.state.doc.length };
  return { id: doc.id, ...range, text: app.view.state.sliceDoc(range.from, range.to), selection };
}

/** The tab may have changed, or the text been edited, while an async transform was loading. */
const stale = (app: App, s: Source) => app.manager.activeId !== s.id || app.view.state.sliceDoc(s.from, s.to) !== s.text;

const STALE_MESSAGE = "The document changed while the command ran; nothing was applied";
const STALE: ToolResult = { ok: false, message: STALE_MESSAGE };

function fail(app: App, s: Source, r: Extract<ToolResult, { ok: false }>, prefix?: string): ToolResult {
  let where = "";
  if (r.line !== undefined) {
    // The error position is relative to the processed text; map it back to the document (a selection can start mid-line).
    const start = app.view.state.doc.lineAt(s.from);
    const docLine = start.number + r.line - 1;
    const column = r.line === 1 ? s.from - start.from + (r.column ?? 1) : (r.column ?? 1);
    const line = app.view.state.doc.line(Math.min(docLine, app.view.state.doc.lines));
    const pos = Math.min(line.from + Math.max(column - 1, 0), line.to);
    app.setSelection({ from: pos, to: pos });
    where = `Line ${docLine}${r.column !== undefined ? `, column ${column}` : ""}: `;
  }
  app.notify(`${prefix ? `${prefix}: ` : ""}${where}${r.message}`, "error");
  return r;
}

function message(base: string, warnings?: string[]): string {
  return warnings && warnings.length > 0 ? `${base}. Note: ${warnings.join("; ")}` : base;
}

/**
 * Run a text transform on the selection, or the whole document when nothing is selected (design D1). The result is applied
 * as one transaction (one undo step); a failure leaves the text untouched, moves the caret to the error and shows it.
 */
export async function runTool(app: App, spec: ToolSpec): Promise<ToolResult> {
  const s = source(app);
  if (!s) return { ok: false, message: "No document" };
  const result = await spec.run(s.text, { selection: s.selection });
  if (stale(app, s)) {
    app.notify(STALE_MESSAGE, "error");
    return STALE;
  }
  if (!result.ok) return fail(app, s, result, spec.errorPrefix);
  if (!spec.inspectOnly && result.text !== s.text) app.applyChangesToDoc(s.id, [{ from: s.from, to: s.to, insert: result.text }]);
  const doc = app.manager.get(s.id);
  // A manual language choice always wins, as it does for the JSON commands.
  if (doc && doc.language === PLAIN_TEXT && !doc.languageManual) app.manager.setLanguage(s.id, spec.language);
  app.notify(message(result.message ?? spec.success, result.ok ? result.warnings : undefined), "info");
  return result;
}

/** Run a converter and open its result in a new untitled tab, leaving the source tab and its text untouched (design D9). */
export async function runConvert(app: App, spec: ConvertSpec): Promise<ToolResult> {
  const s = source(app);
  if (!s) return { ok: false, message: "No document" };
  const result = await spec.run(s.text, { selection: s.selection });
  if (stale(app, s)) {
    app.notify(STALE_MESSAGE, "error");
    return STALE;
  }
  if (!result.ok) return fail(app, s, result, spec.errorPrefix);
  app.newTab();
  const id = app.manager.activeId!;
  app.applyChangesToDoc(id, [{ from: 0, to: 0, insert: result.text }]);
  // Manual, so content detection never overrides the format the user asked for.
  app.manager.setLanguage(id, spec.target, true);
  app.notify(message(result.message ?? spec.success, result.warnings), "info");
  return result;
}
