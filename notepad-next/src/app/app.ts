import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { isolateHistory } from "@codemirror/commands";
import { createEditorState } from "../editor/createEditor";
import { marksExtension } from "../editor/marks";
import { DocumentManager, type LoadedFile } from "../docs/documentManager";
import type { Ipc } from "../ipc";
import { renderStatusBar } from "../statusbar";
import type { SettingsSource } from "../settings/model";
import type { Platform } from "./platform";
import { applyToDocument, applyToView, settingsExtensions } from "./applySettings";
import { renderTabBar } from "./tabBar";

export interface AppDeps {
  editorParent: HTMLElement;
  tabsEl: HTMLElement;
  statusEl: HTMLElement;
  manager: DocumentManager;
  platform: Platform;
  ipc: Ipc;
  settings: SettingsSource;
  /** Called after quit prompts are resolved; used to flush the session snapshot. */
  onQuit?: () => Promise<void>;
}

/**
 * Wires the document manager to one CodeMirror view, the tab bar and the status bar.
 * Each tab keeps its own EditorState so switching tabs preserves per-tab history.
 */
export class App {
  readonly manager: DocumentManager;
  readonly view: EditorView;
  private states = new Map<string, EditorState>();
  private shownId: string | null = null;

  constructor(private deps: AppDeps) {
    this.manager = deps.manager;
    this.view = new EditorView({ state: createEditorState(), parent: deps.editorParent });
  }

  start(): void {
    this.manager.subscribe(() => this.render());
    this.deps.settings.subscribe(() => this.applySettings());
    this.applySettings();
    if (this.manager.docs.length === 0) this.manager.newDoc();
    else this.render();
  }

  private editorExtensions() {
    return [
      ...settingsExtensions(this.deps.settings.get()),
      ...marksExtension(),
      EditorView.updateListener.of((u) => {
        const id = this.shownId;
        if (!id) return;
        if (u.docChanged) this.manager.setText(id, u.state.doc.toString());
        else if (u.selectionSet) this.renderStatus();
      }),
    ];
  }

  private render(): void {
    // Drop editor state for tabs that no longer exist.
    for (const id of this.states.keys()) if (!this.manager.get(id)) this.states.delete(id);

    const active = this.manager.active;
    if (active && active.id !== this.shownId) this.show(active.id, active.text);

    renderTabBar(this.deps.tabsEl, this.manager, {
      onActivate: (id) => this.activateTab(id),
      onClose: (id) => void this.closeTab(id),
      onNew: () => this.newTab(),
      onMove: (id, to) => this.manager.move(id, to),
    });
    this.renderStatus();
  }

  private show(id: string, text: string): void {
    if (this.shownId) this.states.set(this.shownId, this.view.state);
    const state = this.states.get(id) ?? createEditorState(text, this.editorExtensions());
    this.shownId = id;
    this.view.setState(state);
    // A stored state keeps the settings it was created under; bring it up to date.
    applyToView(this.view, this.deps.settings.get());
  }

  private applySettings(): void {
    const dark = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
    applyToDocument(document.documentElement, this.deps.settings.get(), dark);
    applyToView(this.view, this.deps.settings.get());
  }

  private renderStatus(): void {
    const doc = this.manager.active;
    if (!doc) return;
    renderStatusBar(this.deps.statusEl, this.view, { eol: doc.eol, encoding: doc.encoding, language: doc.language });
  }

  getSelection(): { from: number; to: number } {
    const r = this.view.state.selection.main;
    return { from: r.from, to: r.to };
  }

  setSelection(range: { from: number; to: number }): void {
    this.view.dispatch({ selection: { anchor: range.from, head: range.to }, scrollIntoView: true });
  }

  /** Apply edits as one transaction (one undo step) to the shown tab, or to a background tab's stored state. */
  applyChangesToDoc(id: string, changes: { from: number; to: number; insert: string }[]): void {
    if (changes.length === 0) return;
    // isolateHistory keeps a Replace All from merging with earlier typing, so one undo reverts exactly it.
    const isolate = isolateHistory.of("full");
    if (id === this.shownId) {
      this.view.dispatch({ changes, annotations: isolate });
      return;
    }
    const doc = this.manager.get(id);
    if (!doc) return;
    const base = this.states.get(id) ?? createEditorState(doc.text, this.editorExtensions());
    const next = base.update({ changes, annotations: isolate }).state;
    this.states.set(id, next);
    this.manager.setText(id, next.doc.toString());
  }

  newTab(): void {
    this.manager.newDoc();
  }

  activateTab(id: string): void {
    this.manager.activate(id);
  }

  async openFileDialog(): Promise<void> {
    const path = await this.deps.platform.pickOpenPath();
    if (!path) return;
    const file = await this.deps.ipc.invoke<LoadedFile>("open_file", { path });
    this.manager.openFile(path, file);
  }

  /** Save the active tab; returns false when the user cancels the save dialog. */
  async save(): Promise<boolean> {
    const doc = this.manager.active;
    return doc ? this.saveDoc(doc.id) : false;
  }

  private async saveDoc(id: string): Promise<boolean> {
    const doc = this.manager.get(id);
    if (!doc) return false;
    const path = doc.path ?? (await this.deps.platform.pickSavePath(doc.title));
    if (!path) return false;
    await this.deps.ipc.invoke("save_file_cmd", {
      path,
      text: doc.text,
      encoding: doc.encoding,
      bom: doc.bom,
      eol: doc.eol,
    });
    this.manager.markSaved(id, path);
    return true;
  }

  /**
   * Quit flow. silentClose off: prompt for each dirty tab (Cancel aborts the quit).
   * silentClose on: no prompts; the session snapshot keeps every tab's text.
   * Returns true when the app may exit.
   */
  async requestQuit(): Promise<boolean> {
    if (!this.deps.settings.get().silentClose) {
      for (const doc of this.manager.docs.filter((d) => d.dirty)) {
        this.manager.activate(doc.id);
        const choice = await this.deps.platform.confirmUnsaved(doc.title);
        if (choice === "cancel") return false;
        if (choice === "save" && !(await this.saveDoc(doc.id))) return false;
        if (choice === "discard") this.manager.close(doc.id);
      }
    }
    await this.deps.onQuit?.();
    return true;
  }

  async closeTab(id: string): Promise<void> {
    const doc = this.manager.get(id);
    if (!doc) return;
    const decision = this.manager.requestClose(id, { silentClose: this.deps.settings.get().silentClose });
    if (decision === "prompt") {
      const choice = await this.deps.platform.confirmUnsaved(doc.title);
      if (choice === "cancel") return;
      if (choice === "save" && !(await this.saveDoc(id))) return;
      this.manager.close(id);
    }
    // Like Notepad++, never leave the window without a document.
    if (this.manager.docs.length === 0) this.manager.newDoc();
  }
}
