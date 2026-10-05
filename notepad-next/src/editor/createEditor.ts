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
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { indentLess, tabIndent } from "../edit/indent";
import { bracketMatching, codeFolding, foldGutter, foldKeymap, indentOnInput } from "@codemirror/language";

/**
 * Editor core extensions (spec: editor-core). Multi-caret comes from
 * allowMultipleSelections (Cmd/Ctrl-click adds a caret); column mode from
 * rectangularSelection (Alt-drag).
 */
export function coreExtensions(): Extension[] {
  return [
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
    keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, { key: "Tab", run: tabIndent, shift: indentLess }]),
  ];
}

export interface CreateEditorOptions {
  parent: HTMLElement;
  doc?: string;
  extensions?: Extension[];
}

export function createEditorState(doc = "", extensions: Extension[] = []): EditorState {
  return EditorState.create({ doc, extensions: [...coreExtensions(), ...extensions] });
}

export function createEditor({ parent, doc = "", extensions = [] }: CreateEditorOptions): EditorView {
  return new EditorView({ state: createEditorState(doc, extensions), parent });
}
