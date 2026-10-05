import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet } from "@codemirror/view";
import { validate } from "../json/jsonTools";

/** Documents larger than this are not validated while typing (validation is O(n)). */
export const JSON_ERROR_MAX_CHARS = 1_000_000;

/** Range to underline for the first syntax error, or null when the text is valid, blank or too large. */
export function jsonErrorRange(text: string): { from: number; to: number } | null {
  if (text.length > JSON_ERROR_MAX_CHARS || text.trim() === "") return null;
  const r = validate(text);
  if (r.ok) return null;
  // An error at the very end of the input has no character to cover, so underline the last one.
  if (r.offset >= text.length) return { from: Math.max(0, text.length - 1), to: text.length };
  return { from: r.offset, to: r.offset + 1 };
}

const setError = StateEffect.define<{ from: number; to: number } | null>();
const errorMark = Decoration.mark({ class: "cm-json-error", attributes: { "aria-invalid": "true" } });

const errorField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes); // keep the mark attached to its text until the next validation
    for (const e of tr.effects) {
      if (e.is(setError)) deco = e.value ? Decoration.set([errorMark.range(e.value.from, e.value.to)]) : Decoration.none;
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * Underline the first JSON syntax error (spec: syntax-highlighting). Validation runs after the user
 * pauses typing, so the mark does not flicker while a value is half written.
 */
export function jsonErrorMarks(delayMs = 300): Extension {
  const validator = ViewPlugin.fromClass(
    class {
      private timer: ReturnType<typeof setTimeout> | null = null;
      constructor(private view: EditorView) {
        this.schedule();
      }
      update(u: { docChanged: boolean }) {
        if (u.docChanged) this.schedule();
      }
      private schedule() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.timer = null;
          // Dispatching from a timer is safe; the view may have been destroyed meanwhile.
          if (!this.view.dom.isConnected) return;
          this.view.dispatch({ effects: setError.of(jsonErrorRange(this.view.state.doc.toString())) });
        }, delayMs);
      }
      destroy() {
        if (this.timer) clearTimeout(this.timer);
      }
    },
  );
  return [errorField, validator];
}
