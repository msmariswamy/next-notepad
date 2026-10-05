import { Compartment, EditorState } from "@codemirror/state";
import { classHighlighter } from "@lezer/highlight";
import { syntaxHighlighting } from "@codemirror/language";
import { isolateHistory } from "@codemirror/commands";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { undoGrouping, type UndoGroup } from "../macro/undoGroup";
import { createEditorState } from "../editor/createEditor";
import { marksExtension } from "../editor/marks";
import { exceedsLargeFileLimit } from "../files/limits";
import { detectFromContent } from "../lang/detect";
import { PLAIN_TEXT, detectLanguage, hasRecognisedExtension, loadLanguageExtension } from "../lang/languages";
import { DocumentManager, type LoadedFile, type ViewState } from "../docs/documentManager";
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
  /** Transient user-visible messages (toast). */
  notify?: (message: string, kind: "info" | "error") => void;
  /** Delay before content-based language detection runs after an edit (ms). */
  detectDelayMs?: number;
}

/**
 * Wires the document manager to one CodeMirror view, the tab bar and the status bar.
 * Each tab keeps its own EditorState so switching tabs preserves per-tab history.
 */
export class App {
  readonly manager: DocumentManager;
  readonly view: EditorView;
  /** Folder opened with "Open Folder"; Find in Projects searches it. */
  projectRoot: string | null = null;
  private states = new Map<string, EditorState>();
  private shownId: string | null = null;
  private languageCompartment = new Compartment();
  /** Language each tab's editor state is currently configured with. */
  private appliedLanguage = new Map<string, string>();
  private appliedEol = new Map<string, string>();
  /** True while a restored scroll position is being applied, so the resulting events do not overwrite it with 0. */
  private restoringView = false;
  private updateListeners = new Set<(u: ViewUpdate) => void>();
  private undoGroup: UndoGroup | null = null;

  constructor(private deps: AppDeps) {
    this.manager = deps.manager;
    this.view = new EditorView({ state: createEditorState(), parent: deps.editorParent });
    this.view.scrollDOM.addEventListener("scroll", () => this.captureView());
  }

  start(): void {
    this.manager.subscribe(() => this.render());
    this.deps.settings.subscribe(() => this.applySettings());
    this.applySettings();
    if (this.manager.docs.length === 0) this.manager.newDoc();
    else this.render();
  }

  /**
   * Everything edited until endUndoGroup() becomes one undo step (a macro playback). Nesting is not supported:
   * the caller that opened the group closes it.
   */
  beginUndoGroup(): void {
    this.undoGroup = { time: Date.now(), first: true };
  }

  endUndoGroup(): void {
    if (!this.undoGroup) return;
    this.undoGroup = null;
    // Close the event so the next thing the user types starts a new one instead of joining the group.
    this.view.dispatch({ annotations: isolateHistory.of("after") });
  }

  /** Subscribe to every editor update (edits, selection, language/parse changes) of whichever tab is shown. */
  onEditorUpdate(fn: (u: ViewUpdate) => void): () => void {
    this.updateListeners.add(fn);
    return () => this.updateListeners.delete(fn);
  }

  private editorExtensions() {
    return [
      ...settingsExtensions(this.deps.settings.get(), this.manager.active?.eol ?? "lf"),
      ...marksExtension(),
      undoGrouping(() => this.undoGroup),
      syntaxHighlighting(classHighlighter),
      this.languageCompartment.of([]),
      EditorView.updateListener.of((u) => {
        for (const fn of this.updateListeners) fn(u);
        const id = this.shownId;
        if (!id) return;
        if (u.docChanged) this.manager.setText(id, u.state.doc.toString());
        else if (u.selectionSet) this.renderStatus();
        if (u.docChanged || u.selectionSet) this.captureView();
      }),
    ];
  }

  private render(): void {
    // Drop editor state for tabs that no longer exist.
    for (const id of this.states.keys()) if (!this.manager.get(id)) this.states.delete(id);
    for (const id of this.appliedLanguage.keys()) if (!this.manager.get(id)) this.appliedLanguage.delete(id);

    const active = this.manager.active;
    if (active && active.id !== this.shownId) this.show(active.id, active.text);
    if (active) void this.syncLanguage(active.id, active.language);
    this.scheduleDetection();
    // The line-ending marker text follows the tab's EOL, so refresh it when that changes.
    if (active && this.appliedEol.get(active.id) !== active.eol) {
      this.appliedEol.set(active.id, active.eol);
      applyToView(this.view, this.deps.settings.get(), active.eol);
    }

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
    const stored = this.states.get(id);
    const state = stored ?? createEditorState(text, this.editorExtensions());
    this.shownId = id;
    this.view.setState(state);
    // A stored state keeps the settings it was created under; bring it up to date.
    applyToView(this.view, this.deps.settings.get(), this.manager.active?.eol ?? "lf");
    const saved = this.manager.get(id)?.viewState;
    // A fresh state (first time shown, e.g. restored from a session) takes the saved caret; a stored one already has its own.
    if (saved) this.restoreView(saved, !stored);
  }

  /** Remember the shown tab's caret and scroll position so the session snapshot can store it. */
  private captureView(): void {
    const id = this.shownId;
    if (!id || this.restoringView) return;
    const sel = this.view.state.selection.main;
    this.manager.setViewState(id, { anchor: sel.anchor, head: sel.head, scrollTop: this.view.scrollDOM.scrollTop });
  }

  /** Put the caret and scroll back where they were, clamped to the text in case the file changed on disk. */
  private restoreView(saved: ViewState, applySelection: boolean): void {
    this.restoringView = true;
    if (applySelection) {
      const len = this.view.state.doc.length;
      this.view.dispatch({ selection: { anchor: Math.min(saved.anchor, len), head: Math.min(saved.head, len) } });
    }
    // Scroll once CodeMirror has measured the document, otherwise the height is still an estimate of 0.
    this.view.requestMeasure({
      read: () => null,
      write: () => {
        this.view.scrollDOM.scrollTop = saved.scrollTop;
        this.restoringView = false;
        this.captureView();
      },
    });
  }

  /** Load the grammar for a tab's language (async, cached) and reconfigure the editor if it changed. */
  private async syncLanguage(id: string, language: string): Promise<void> {
    if (this.appliedLanguage.get(id) === language) return;
    const ext = await loadLanguageExtension(language);
    // The tab may have been closed or switched to another language while the grammar loaded.
    if (this.manager.get(id)?.language !== language || this.shownId !== id) return;
    this.appliedLanguage.set(id, language);
    this.view.dispatch({ effects: this.languageCompartment.reconfigure(ext) });
  }

  /** Resolves once the shown tab's highlighting matches its language (useful for tests). */
  async languageReady(): Promise<void> {
    const doc = this.manager.active;
    if (doc) await this.syncLanguage(doc.id, doc.language);
  }

  private applySettings(): void {
    const dark = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
    applyToDocument(document.documentElement, this.deps.settings.get(), dark);
    applyToView(this.view, this.deps.settings.get(), this.manager.active?.eol ?? "lf");
  }

  private renderStatus(): void {
    const doc = this.manager.active;
    if (!doc) return;
    renderStatusBar(this.deps.statusEl, this.view, { eol: doc.eol, encoding: doc.encoding, language: doc.language, missing: doc.missing });
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
    await this.openPath(path);
  }

  get clipboard() {
    return this.deps.platform.clipboard;
  }

  notify(message: string, kind: "info" | "error" = "info"): void {
    this.deps.notify?.(message, kind);
  }

  /** Change the active tab's line ending (applied on save; the tab becomes modified). */
  setEol(eol: "lf" | "crlf" | "cr"): void {
    if (this.manager.activeId) this.manager.setEol(this.manager.activeId, eol);
  }

  /** Change the encoding the active tab will be saved with (the in-memory text is unchanged). */
  setEncoding(encoding: string, bom = false): void {
    if (this.manager.activeId) this.manager.setEncoding(this.manager.activeId, encoding, bom);
  }

  /** The user picked a language from the menu: it sticks and is never overridden by detection. */
  setLanguage(language: string): void {
    if (this.manager.activeId) this.manager.setLanguage(this.manager.activeId, language, true);
  }

  private detectTimer: ReturnType<typeof setTimeout> | null = null;

  /** Untitled / unknown-extension tabs that are still plain text and were not set by the user. */
  private canAutoDetect(doc: { language: string; languageManual: boolean; path: string | null }): boolean {
    return doc.language === PLAIN_TEXT && !doc.languageManual && !hasRecognisedExtension(doc.path);
  }

  /** Detect the active tab's language from its content now; returns the language set, or null if nothing fits. */
  detectLanguageNow(): string | null {
    const doc = this.manager.active;
    if (!doc) return null;
    const lang = detectFromContent(doc.text);
    if (lang) this.manager.setLanguage(doc.id, lang);
    return lang;
  }

  private scheduleDetection(): void {
    if (this.detectTimer) clearTimeout(this.detectTimer);
    this.detectTimer = null;
    const doc = this.manager.active;
    if (!doc || doc.text === "" || !this.canAutoDetect(doc)) return;
    this.detectTimer = setTimeout(() => {
      this.detectTimer = null;
      const d = this.manager.active;
      // Re-check: the tab may have changed, been closed or been set manually during the delay.
      if (d && this.canAutoDetect(d)) this.detectLanguageNow();
    }, this.deps.detectDelayMs ?? 300);
  }

  async openFolder(): Promise<string | null> {
    const root = await this.deps.platform.pickFolder();
    if (root) this.projectRoot = root;
    return root;
  }

  /** Open a file by path and return its tab id, or null if the user declined the large-file warning. */
  async openPath(path: string): Promise<string | null> {
    const existing = this.manager.docs.find((d) => d.path === path);
    if (existing) {
      this.manager.activate(existing.id);
      return existing.id;
    }
    if (!(await this.confirmLargeFile(path))) return null;
    const file = await this.deps.ipc.invoke<LoadedFile>("open_file", { path });
    const doc = this.manager.openFile(path, file);
    this.manager.setLanguage(doc.id, detectLanguage(path));
    return doc.id;
  }

  /** Warn before loading a file above the large-file threshold; an unknown size never blocks opening. */
  private async confirmLargeFile(path: string): Promise<boolean> {
    let size: number;
    try {
      size = await this.deps.ipc.invoke<number>("file_size", { path });
    } catch {
      return true;
    }
    if (!exceedsLargeFileLimit(size, this.deps.settings.get().largeFileThresholdBytes)) return true;
    const mb = (size / (1024 * 1024)).toFixed(1);
    const name = path.split(/[\\/]/).pop();
    return this.deps.platform.confirm(`"${name}" is ${mb} MB. Opening very large files can be slow. Open it anyway?`, "Open");
  }

  /** Select a match by 1-based line and UTF-16 column range within that line. */
  selectLineColumns(line: number, start: number, end: number): void {
    const doc = this.view.state.doc;
    const l = doc.line(Math.min(Math.max(line, 1), doc.lines));
    this.setSelection({ from: Math.min(l.from + start, l.to), to: Math.min(l.from + end, l.to) });
  }

  /** Save the active tab; returns false when the user cancels the save dialog. */
  async save(): Promise<boolean> {
    const doc = this.manager.active;
    return doc ? this.saveDoc(doc.id) : false;
  }

  /** Save the active tab under a new path chosen in the save dialog. */
  async saveAs(): Promise<boolean> {
    const doc = this.manager.active;
    return doc ? this.saveDoc(doc.id, true) : false;
  }

  private async saveDoc(id: string, forceDialog = false): Promise<boolean> {
    const doc = this.manager.get(id);
    if (!doc) return false;
    const path = (!forceDialog && doc.path) || (await this.deps.platform.pickSavePath(doc.title));
    if (!path) return false;
    try {
      await this.deps.ipc.invoke("save_file_cmd", {
        path,
        text: doc.text,
        encoding: doc.encoding,
        bom: doc.bom,
        eol: doc.eol,
      });
    } catch (e) {
      // e.g. text that cannot be represented in the chosen encoding; the tab stays modified.
      this.notify(`Could not save ${doc.title}: ${e}`, "error");
      return false;
    }
    this.manager.markSaved(id, path);
    // A tab saved under a new name picks up that name's language unless the user chose one.
    if (doc.language === PLAIN_TEXT && !doc.languageManual) this.manager.setLanguage(id, detectLanguage(path));
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
