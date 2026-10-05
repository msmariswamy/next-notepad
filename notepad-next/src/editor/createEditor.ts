import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, codeFolding, foldGutter, foldKeymap, indentOnInput } from "@codemirror/language";

export interface CreateEditorOptions {
  parent: HTMLElement;
  doc?: string;
  extensions?: Extension[];
}

/**
 * Editor core (spec: editor-core). Multi-caret comes from allowMultipleSelections
 * (Cmd/Ctrl-click adds a caret); column mode from rectangularSelection (Alt-drag).
 */
export function createEditor({ parent, doc = "", extensions = [] }: CreateEditorOptions): EditorView {
  const state = EditorState.create({
    doc,
    extensions: [
      EditorState.allowMultipleSelections.of(true),
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      drawSelection(),
      history(),
      indentOnInput(),
      bracketMatching(),
      codeFolding(),
      foldGutter(),
      rectangularSelection(),
      crosshairCursor(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
      ...extensions,
    ],
  });
  return new EditorView({ state, parent });
}
