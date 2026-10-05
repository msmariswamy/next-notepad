import { classHighlighter } from "@lezer/highlight";
import { syntaxHighlighting } from "@codemirror/language";
import { redo, undo } from "@codemirror/commands";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import type { App } from "../app/app";
import { applyToView, settingsExtensions } from "../app/applySettings";
import { coreExtensions } from "../editor/createEditor";
import { loadLanguageExtension } from "../lang/languages";
import type { SettingsSource } from "../settings/model";
import { mirror, splitSync } from "./splitSync";

export type Orientation = "vertical" | "horizontal";

export interface SplitViewDeps {
  app: App;
  /** Container of both panes; `data-split` on it selects the layout. */
  panes: HTMLElement;
  /** Host element for the second pane (hidden while there is no split). */
  secondParent: HTMLElement;
  settings: SettingsSource;
}

/**
 * Split view (spec: split-view, ADR-0005): a second EditorView mirrors the active tab. The primary view keeps
 * owning the document, the dirty state and the only undo history; the clone has no history and routes undo/redo
 * to the primary. The split closes when the active tab changes or its tab is closed, and is never persisted.
 */
export class SplitView {
  secondary: EditorView | null = null;
  /** Language the clone is currently highlighted with. */
  appliedLanguage = "";
  private docId: string | null = null;
  private languageCompartment = new Compartment();
  private unsubs: (() => void)[] = [];
  private primaryUnsub: (() => void) | null = null;

  constructor(private deps: SplitViewDeps) {
    this.unsubs.push(
      deps.app.manager.subscribe(() => this.onManagerChange()),
      deps.settings.subscribe(() => this.applySettings()),
    );
  }

  get isOpen(): boolean {
    return this.secondary !== null;
  }

  dispose(): void {
    for (const off of this.unsubs) off();
    this.close();
  }

  /** Open the split in the given layout; if already open, only the layout changes. */
  open(orientation: Orientation): void {
    const { app, panes, secondParent } = this.deps;
    panes.dataset.split = orientation;
    if (this.secondary) return;
    const doc = app.manager.active;
    if (!doc) return;
    this.docId = doc.id;
    const settings = this.deps.settings.get();
    const primary = app.view;
    const state = EditorState.create({
      doc: primary.state.doc.toString(),
      selection: { anchor: primary.state.selection.main.anchor, head: primary.state.selection.main.head },
      extensions: [
        ...coreExtensions({ history: false }),
        ...settingsExtensions(settings, doc.eol),
        syntaxHighlighting(classHighlighter),
        this.languageCompartment.of([]),
        splitSync(() => app.view),
        Prec.highest(keymap.of([
          { key: "Mod-z", run: () => this.undoFromClone(), preventDefault: true },
          { key: "Mod-y", mac: "Mod-Shift-z", run: () => this.redoFromClone(), preventDefault: true },
          { key: "Mod-Shift-z", run: () => this.redoFromClone(), preventDefault: true },
        ])),
      ],
    });
    secondParent.hidden = false;
    this.secondary = new EditorView({ state, parent: secondParent });
    // The clone mirrors into the primary through its own extension; the primary's edits are mirrored back here.
    this.primaryUnsub = app.onEditorUpdate((update) => {
      if (this.secondary) mirror(update, this.secondary);
    });
    this.appliedLanguage = "";
    void this.syncLanguage();
  }

  close(): void {
    if (!this.secondary) return;
    const { panes, secondParent, app } = this.deps;
    this.primaryUnsub?.();
    this.primaryUnsub = null;
    this.secondary.destroy();
    this.secondary = null;
    this.docId = null;
    secondParent.hidden = true;
    delete panes.dataset.split;
    app.view.focus();
  }

  /** Move keyboard focus to the other pane. */
  moveToOtherPane(): void {
    if (!this.secondary) return;
    if (this.secondary.hasFocus) this.deps.app.view.focus();
    else this.secondary.focus();
  }

  undoFromClone(): boolean {
    return undo(this.deps.app.view);
  }

  redoFromClone(): boolean {
    return redo(this.deps.app.view);
  }

  private onManagerChange(): void {
    if (!this.secondary) return;
    const { manager } = this.deps.app;
    if (manager.activeId !== this.docId || !this.docId || !manager.get(this.docId)) {
      this.close();
      return;
    }
    void this.syncLanguage();
  }

  private async syncLanguage(): Promise<void> {
    const doc = this.docId ? this.deps.app.manager.get(this.docId) : undefined;
    if (!doc || !this.secondary || this.appliedLanguage === doc.language) return;
    const language = doc.language;
    const ext = await loadLanguageExtension(language);
    // The split may have closed, or the language changed again, while the grammar loaded.
    if (!this.secondary || this.deps.app.manager.get(this.docId ?? "")?.language !== language) return;
    this.appliedLanguage = language;
    this.secondary.dispatch({ effects: this.languageCompartment.reconfigure(ext) });
  }

  private applySettings(): void {
    if (!this.secondary) return;
    applyToView(this.secondary, this.deps.settings.get(), this.deps.app.manager.active?.eol ?? "lf");
  }
}
