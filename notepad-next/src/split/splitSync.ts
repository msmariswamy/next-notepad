import { Annotation, Transaction, type Extension } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";

/** Marks a transaction that was produced by mirroring, so the receiving view does not mirror it back. */
export const synced = Annotation.define<boolean>();

/**
 * Keeps two views on one document (design D1, ADR-0005). Every document change that did not itself come
 * from the sync is replayed on the other view, whichever pane it came from; the primary view owns the only
 * undo history, so a change made in the clone lands there as an ordinary user edit and undo reaches both panes.
 * Selections stay per view and are mapped through the replayed changes by CodeMirror.
 */
export function splitSync(other: () => EditorView | null): Extension {
  return EditorView.updateListener.of((update) => {
    const target = other();
    if (target) mirror(update, target);
  });
}

/** Replay the update's own (non-mirrored) document changes on `target`. */
export function mirror(update: ViewUpdate, target: EditorView): void {
  for (const tr of update.transactions) {
    if (!tr.docChanged || tr.annotation(synced)) continue;
    const userEvent = tr.annotation(Transaction.userEvent);
    // Carrying userEvent keeps the primary's history grouping (typing merges) intact for edits that start in the clone.
    target.dispatch({ changes: tr.changes, annotations: [synced.of(true), ...(userEvent ? [Transaction.userEvent.of(userEvent)] : [])] });
  }
}
