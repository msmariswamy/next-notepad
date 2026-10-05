import { Compartment, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { showWhitespace } from "../editor/whitespace";
import { resolveTheme, settingsToCssVars, type Settings } from "../settings/model";

export const wrapCompartment = new Compartment();
export const whitespaceCompartment = new Compartment();

export const wrapExtension = (s: Settings): Extension => (s.wordWrap ? EditorView.lineWrapping : []);
export const whitespaceExtension = (s: Settings): Extension => (s.showWhitespace ? showWhitespace : []);

/** Extensions whose configuration follows user settings; start values come from the current settings. */
export function settingsExtensions(s: Settings): Extension[] {
  return [wrapCompartment.of(wrapExtension(s)), whitespaceCompartment.of(whitespaceExtension(s))];
}

/** Reconfigure a live view (needed again after swapping in a stored per-tab state). */
export function applyToView(view: EditorView, s: Settings): void {
  view.dispatch({
    effects: [wrapCompartment.reconfigure(wrapExtension(s)), whitespaceCompartment.reconfigure(whitespaceExtension(s))],
  });
}

/** Theme and font go through CSS variables on the root element so all tabs update at once. */
export function applyToDocument(root: HTMLElement, s: Settings, systemPrefersDark: boolean): void {
  root.dataset.theme = resolveTheme(s.theme, systemPrefersDark);
  for (const [name, value] of Object.entries(settingsToCssVars(s))) root.style.setProperty(name, value);
}
