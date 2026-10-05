import type { App } from "../app/app";
import { PLAIN_TEXT } from "../lang/languages";
import { escapeAsJsonString, minify, prettyPrint, sortKeys, unescapeJsonString, validate, type JsonError } from "./jsonTools";

export type JsonAction = "pretty" | "pretty4" | "prettyTabs" | "minify" | "sortKeys" | "escape" | "unescape" | "validate";

const INDENT: Record<string, string> = { pretty: "  ", pretty4: "    ", prettyTabs: "\t" };
const DONE: Record<string, string> = { pretty: "JSON formatted", pretty4: "JSON formatted", prettyTabs: "JSON formatted", minify: "JSON minified", sortKeys: "JSON keys sorted" };

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

  const replace = (next: string) => {
    if (next !== text) app.applyChangesToDoc(doc.id, [{ from: range.from, to: range.to, insert: next }]);
  };

  if (action === "escape") {
    replace(escapeAsJsonString(text));
    return report({ ok: true, message: "Escaped as a JSON string" });
  }
  if (action === "unescape") {
    const raw = unescapeJsonString(text);
    if (raw === null) return report({ ok: false, message: "Not a valid JSON string" });
    replace(raw);
    return report({ ok: true, message: "Unescaped JSON string" });
  }

  const r = action === "minify" ? minify(text) : action === "sortKeys" ? sortKeys(text) : prettyPrint(text, INDENT[action]);
  if (!r.ok) return fail(r);
  replace(r.text);
  // Valid JSON in a plain-text tab: switch the language so the text is highlighted as JSON from now on.
  if (doc.language === PLAIN_TEXT) app.manager.setLanguage(doc.id, "JSON");
  return report({ ok: true, message: DONE[action] });
}
