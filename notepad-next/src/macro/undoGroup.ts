import { isolateHistory } from "@codemirror/commands";
import { Annotation, EditorState, Transaction, type Extension, type TransactionSpec } from "@codemirror/state";
import { synced } from "../split/splitSync";

/** Marks an edit made inside an undo group; the history's `joinToEvent` (createEditor) joins such edits into one event. */
export const macroGroup = Annotation.define<boolean>();

export interface UndoGroup {
  /** One timestamp for every edit of the group, so CodeMirror's 500 ms grouping window never splits it. */
  time: number;
  /** True until the first edit, which starts a new history event instead of joining the previous one. */
  first: boolean;
}

/**
 * Turns everything dispatched while an undo group is open into a single history event (design D2: a playback
 * is one undo step). Commands dispatch their own transactions, often isolating history themselves, so this
 * rewrites them: edits get one shared time, `input.type` so they are joinable, and the group tag; selection-only
 * transactions stay out of history because a recorded selection would end the group (CodeMirror joins events
 * only while the last one has no selection entries after it). Undo and redo pass through untouched.
 */
export function undoGrouping(current: () => UndoGroup | null): Extension {
  return EditorState.transactionFilter.of((tr): Transaction | readonly TransactionSpec[] | TransactionSpec => {
    const group = current();
    if (!group || tr.isUserEvent("undo") || tr.isUserEvent("redo")) return tr;
    if (!tr.docChanged) return tr.selection || tr.effects.length ? [tr, { annotations: Transaction.addToHistory.of(false) }] : tr;
    const first = group.first;
    group.first = false;
    return {
      changes: tr.changes,
      selection: tr.selection,
      effects: tr.effects,
      scrollIntoView: tr.scrollIntoView,
      filter: false,
      annotations: [
        Transaction.time.of(group.time),
        Transaction.userEvent.of("input.type"),
        macroGroup.of(true),
        ...(first ? [isolateHistory.of("before")] : []),
        ...(tr.annotation(synced) ? [synced.of(true)] : []),
      ],
    };
  });
}
