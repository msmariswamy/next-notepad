import type { App } from "../app/app";
import { PLAIN_TEXT } from "../lang/languages";
import { FORMATTABLE, formatCode, isFormattable } from "./format";

export interface FormatOutcome {
  ok: boolean;
  message: string;
}

/**
 * Format Document (spec: code-formatting): format the selection, or the whole document, according to
 * the tab's language. A Normal-text tab is detected first. Failures leave the text untouched.
 */
export async function runFormatDocument(app: App, opts: { tabWidth: number; useTabs: boolean }): Promise<FormatOutcome> {
  const doc = app.manager.active;
  if (!doc) return { ok: false, message: "No document" };
  const report = (o: FormatOutcome): FormatOutcome => {
    app.notify(o.message, o.ok ? "info" : "error");
    return o;
  };

  if (doc.language === PLAIN_TEXT) {
    const detected = app.detectLanguageNow();
    if (!detected) {
      return report({ ok: false, message: `Could not detect the language. Choose one from the Language menu (${FORMATTABLE.join(", ")}).` });
    }
  }
  const language = app.manager.active!.language;
  if (!isFormattable(language)) return report({ ok: false, message: `No formatter for ${language}` });

  const sel = app.getSelection();
  const range = sel.from === sel.to ? { from: 0, to: app.view.state.doc.length } : sel;
  const text = app.view.state.sliceDoc(range.from, range.to);
  const whole = sel.from === sel.to;

  const result = await formatCode(language, text, opts);
  // The tab may have changed while an async formatter was loading.
  if (app.manager.activeId !== doc.id || app.view.state.sliceDoc(range.from, range.to) !== text) {
    return report({ ok: false, message: "The document changed while formatting; nothing was applied" });
  }
  if (!result.ok) {
    if (result.line !== undefined && whole) {
      const line = app.view.state.doc.line(Math.min(result.line, app.view.state.doc.lines));
      const pos = Math.min(line.from + Math.max((result.column ?? 1) - 1, 0), line.to);
      app.setSelection({ from: pos, to: pos });
    }
    const where = result.line !== undefined ? `Line ${result.line}${result.column !== undefined ? `, column ${result.column}` : ""}: ` : "";
    return report({ ok: false, message: `Cannot format ${language}: ${where}${result.message}` });
  }
  // Formatters drop the trailing newline; keep it when the original had one so lines do not merge.
  const formatted = /\n$/.test(text) && !result.text.endsWith("\n") ? result.text + "\n" : result.text;
  if (formatted !== text) app.applyChangesToDoc(doc.id, [{ from: range.from, to: range.to, insert: formatted }]);
  return report({ ok: true, message: `Formatted as ${language}` });
}
