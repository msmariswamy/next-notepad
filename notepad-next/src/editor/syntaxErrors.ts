import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet } from "@codemirror/view";

export type ErrorRange = { from: number; to: number } | null;

export interface ErrorMarkOptions {
  /** The range to underline for the first error, or null when the text is valid. May be async. */
  validate: (text: string) => ErrorRange | Promise<ErrorRange>;
  /** CSS class of the underline. */
  className: string;
  delayMs?: number;
}

/**
 * Underline the first syntax error of a language (design D7), like jsonErrorMarks does for JSON: validation runs after
 * the user pauses typing, the mark stays attached to its text until the next validation, and an async validator's
 * answer is dropped if the text changed or the view went away in the meantime. Every call makes its own state, so
 * several of these can live in one editor.
 */
export function languageErrorMarks({ validate, className, delayMs = 300 }: ErrorMarkOptions): Extension {
  const setError = StateEffect.define<ErrorRange>();
  const errorMark = Decoration.mark({ class: className, attributes: { "aria-invalid": "true" } });

  const errorField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
      deco = deco.map(tr.changes);
      for (const e of tr.effects) {
        if (e.is(setError)) deco = e.value ? Decoration.set([errorMark.range(e.value.from, e.value.to)]) : Decoration.none;
      }
      return deco;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  const validator = ViewPlugin.fromClass(
    class {
      private timer: ReturnType<typeof setTimeout> | null = null;
      private alive = true;
      constructor(private view: EditorView) {
        this.schedule();
      }
      update(u: { docChanged: boolean }) {
        if (u.docChanged) this.schedule();
      }
      private schedule() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.run(), delayMs);
      }
      private async run() {
        this.timer = null;
        if (!this.alive || !this.view.dom.isConnected) return;
        const doc = this.view.state.doc;
        let range: ErrorRange;
        try {
          range = await validate(doc.toString());
        } catch {
          return; // a validator that fails (for example a grammar that did not load) shows no mark rather than breaking typing
        }
        // The text may have changed while an async validator ran; a newer validation is already scheduled for it.
        if (!this.alive || this.view.state.doc !== doc) return;
        this.view.dispatch({ effects: setError.of(range) });
      }
      destroy() {
        this.alive = false;
        if (this.timer) clearTimeout(this.timer);
      }
    },
  );
  return [errorField, validator];
}
