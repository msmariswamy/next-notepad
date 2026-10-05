import type { App } from "../app/app";
import { minify, prettyPrint, validate, type JsonError } from "./jsonTools";

export type JsonAction = "pretty" | "minify" | "validate";

export interface CommandResult {
  ok: boolean;
  message: string;
}

const describe = (e: JsonError) => `Line ${e.line}, column ${e.column}: ${e.message}`;

/**
 * Run a JSON command on the selection, or the whole document when nothing is selected.
 * Formatting is one undoable edit; invalid JSON is never modified and the caret jumps to the error.
 */
export function runJsonCommand(app: App, action: JsonAction): CommandResult {
  const doc = app.manager.active;
  if (!doc) return { ok: false, message: "No document" };
  const sel = app.getSelection();
  const range = sel.from === sel.to ? { from: 0, to: app.view.state.doc.length } : sel;
  const text = app.view.state.sliceDoc(range.from, range.to);

  const report = (result: CommandResult): CommandResult => {
    app.notify(result.message, result.ok ? "info" : "error");
    return result;
  };
  const fail = (e: JsonError) => {
    // The error offset is relative to the processed text; map it back into the document.
    app.setSelection({ from: range.from + e.offset, to: range.from + e.offset });
    return report({ ok: false, message: describe(e) });
  };

  if (action === "validate") {
    const r = validate(text);
    return r.ok ? report({ ok: true, message: "JSON is valid" }) : fail(r);
  }
  const r = action === "pretty" ? prettyPrint(text) : minify(text);
  if (!r.ok) return fail(r);
  if (r.text !== text) app.applyChangesToDoc(doc.id, [{ from: range.from, to: range.to, insert: r.text }]);
  return report({ ok: true, message: action === "pretty" ? "JSON formatted" : "JSON minified" });
}
