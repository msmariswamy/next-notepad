import type { EditorView } from "@codemirror/view";
import { formatStatus, type Eol } from "./editor/status";

export interface DocMeta {
  eol: Eol;
  encoding: string;
  language: string;
  missing?: boolean;
}

/** Derive status info from editor state; kept pure so it can be unit tested. */
export function statusInfoFor(view: EditorView, meta: DocMeta) {
  const { state } = view;
  const head = state.selection.main;
  const line = state.doc.lineAt(head.head);
  const selected = state.selection.ranges.reduce((n, r) => n + (r.to - r.from), 0);
  const selectionLines = selected === 0 ? 0 : state.doc.lineAt(head.to).number - state.doc.lineAt(head.from).number + 1;
  return {
    line: line.number,
    column: head.head - line.from + 1,
    selectionLength: selected,
    selectionLines,
    length: state.doc.length,
    lines: state.doc.lines,
    ...meta,
  };
}

export function renderStatusBar(el: HTMLElement, view: EditorView, meta: DocMeta): void {
  const segments = formatStatus(statusInfoFor(view, meta));
  el.replaceChildren(
    ...segments.map((text) => {
      const span = document.createElement("span");
      span.textContent = text;
      return span;
    }),
  );
}
