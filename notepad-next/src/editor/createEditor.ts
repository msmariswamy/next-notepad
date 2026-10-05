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
import { recordingKeymap } from "../macro/navCommands";
import { macroGroup } from "../macro/undoGroup";
import { bracketMatching, codeFolding, foldGutter, foldKeymap, indentOnInput } from "@codemirror/language";

/**
 * Editor core extensions (spec: editor-core). Multi-caret comes from
 * allowMultipleSelections (Cmd/Ctrl-click adds a caret); column mode from
 * rectangularSelection (Alt-drag).
 */
export function coreExtensions({ history: withHistory = true }: { history?: boolean } = {}): Extension[] {
  return [
    EditorState.allowMultipleSelections.of(true),
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    drawSelection(),
    // The split-view clone has no history of its own: undo and redo are routed to the primary view (ADR-0005).
    // Edits made while a macro plays are tagged with macroGroup so the whole playback joins one undo event.
    ...(withHistory ? [history({ joinToEvent: (tr, adjacent) => tr.annotation(macroGroup) === true || adjacent })] : []),
    indentOnInput(),
    bracketMatching(),
    codeFolding(),
    foldGutter(),
    rectangularSelection(),
    crosshairCursor(),
    keymap.of([...recordingKeymap(defaultKeymap), ...(withHistory ? historyKeymap : []), ...foldKeymap, { key: "Tab", run: tabIndent, shift: indentLess }]),
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
