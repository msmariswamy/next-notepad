import { indentUnit } from "@codemirror/language";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { eolMarkers, showWhitespace, type EolLabel } from "../editor/whitespace";
import { resolveTheme, settingsToCssVars, type Settings } from "../settings/model";

export const wrapCompartment = new Compartment();
export const whitespaceCompartment = new Compartment();
export const indentCompartment = new Compartment();

export const wrapExtension = (s: Settings): Extension => (s.wordWrap ? EditorView.lineWrapping : []);
export const EOL_LABELS: Record<"lf" | "crlf" | "cr", EolLabel> = { lf: "LF", crlf: "CRLF", cr: "CR" };

/** Show Whitespace marks spaces and tabs; Show All Characters adds line-ending markers on top. */
export const whitespaceExtension = (s: Settings, eol: "lf" | "crlf" | "cr" = "lf"): Extension => [
  s.showWhitespace || s.showAllCharacters ? showWhitespace : [],
  s.showAllCharacters ? eolMarkers(EOL_LABELS[eol]) : [],
];

export const indentExtension = (s: Settings): Extension => [
  EditorState.tabSize.of(s.tabWidth),
  indentUnit.of(s.useTabs ? "\t" : " ".repeat(s.tabWidth)),
];

/** Extensions whose configuration follows user settings; start values come from the current settings. */
export function settingsExtensions(s: Settings, eol: "lf" | "crlf" | "cr" = "lf"): Extension[] {
  return [
    wrapCompartment.of(wrapExtension(s)),
    whitespaceCompartment.of(whitespaceExtension(s, eol)),
    indentCompartment.of(indentExtension(s)),
  ];
}

/** Reconfigure a live view (needed again after swapping in a stored per-tab state). */
export function applyToView(view: EditorView, s: Settings, eol: "lf" | "crlf" | "cr" = "lf"): void {
  view.dispatch({
    effects: [
      wrapCompartment.reconfigure(wrapExtension(s)),
      whitespaceCompartment.reconfigure(whitespaceExtension(s, eol)),
      indentCompartment.reconfigure(indentExtension(s)),
    ],
  });
}

/** Theme and font go through CSS variables on the root element so all tabs update at once. */
export function applyToDocument(root: HTMLElement, s: Settings, systemPrefersDark: boolean): void {
  root.dataset.theme = resolveTheme(s.theme, systemPrefersDark);
  for (const [name, value] of Object.entries(settingsToCssVars(s))) root.style.setProperty(name, value);
}
