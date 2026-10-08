import { DocumentManager } from "./docs/documentManager";
import { App } from "./app/app";
import { createBrowserHost } from "./app/browserHost";
import { tauriPlatform } from "./app/tauriPlatform";
import { tauriIpc } from "./ipc";
import { SettingsStore } from "./settings/store";
import { openSettingsDialog } from "./settings/dialog";
import { SessionClient } from "./session/client";
import { FindController } from "./search/findController";
import { openFindDialog, type FindTab } from "./search/findDialog";
import { renderResults } from "./search/resultsPanel";
import { FilesSearchController } from "./search/filesSearch";
import { tauriFilesApi } from "./search/tauriFilesApi";
import { confirmDialog } from "./app/dialogs";
import { installPalette } from "./lang/palette";
import { buildMenu, createCommands, type Command } from "./app/commands";
import { MacroController } from "./macro/controller";
import { createMacroPrompts } from "./macro/dialogs";
import { MacroPlayer } from "./macro/player";
import { MacroRecorder } from "./macro/recorder";
import { MacroStore } from "./macro/store";
import { dispatchShortcut, renderMenuBar } from "./app/menuBar";
import { createToaster } from "./app/toast";
import { restoreSession } from "./session/snapshot";
import { OpenRequestHandler } from "./cli/openRequests";
import { createFileDropHandler } from "./app/fileDrop";
import { openCommandLineDialog } from "./cli/commandLineDialog";
import { browserOpenHost, tauriOpenHost } from "./cli/hosts";
import { applyDockVisibility, getDock } from "./layout/workspace";
import { FunctionListPanel } from "./functionlist/panel";
import { DocumentMapPanel } from "./documentmap/panel";
import { SplitView } from "./split/splitView";

installPalette();
const inTauri = "__TAURI_INTERNALS__" in window;
const host = inTauri ? { ipc: tauriIpc, platform: tauriPlatform } : createBrowserHost();

const settings = new SettingsStore(host.ipc);
await settings.load();

const manager = new DocumentManager();
// Restore before the app renders so the first paint already shows the saved tabs.
await restoreSession(manager, host.ipc).catch((e) => console.error("session restore failed", e));
const session = new SessionClient(manager, host.ipc);

// Created after the app (it needs the app), but the quit hook is registered with the app, so it is looked up lazily.
let openRequests: OpenRequestHandler | null = null;

const app = new App({
  editorParent: document.getElementById("editor")!,
  tabsEl: document.getElementById("tabs")!,
  statusEl: document.getElementById("statusbar")!,
  manager,
  platform: host.platform,
  ipc: host.ipc,
  settings,
  // A normal quit finishes every waiting `next-notepad --wait` first, so they exit 0 instead of seeing a dropped connection.
  onQuit: async () => {
    await openRequests?.finishAll();
    await session.flush();
  },
  notify: createToaster(document.getElementById("toast")!),
});
app.start();
session.start();
app.view.focus();

// Requests from the `next-notepad` command and macOS open events (design D5).
openRequests = new OpenRequestHandler(app, inTauri ? tauriOpenHost(host.ipc) : browserOpenHost());
await openRequests.start();
if (!inTauri && window.__nextNotepadTest) window.__nextNotepadTest.requestQuit = () => app.requestQuit();

if (inTauri) {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  await win.onCloseRequested(async (event) => {
    event.preventDefault();
    if (await app.requestQuit()) await win.destroy();
  });
} else {
  // No native close event in a browser; flush when the page goes away so a reload acts like quit + relaunch.
  window.addEventListener("pagehide", () => void session.flush());
}

const dock = getDock();
applyDockVisibility(dock, settings.get());
const functionList = new FunctionListPanel(dock.functions, app, () => settings.get());
const documentMap = new DocumentMapPanel(dock.map, app, () => settings.get());
settings.subscribe((s) => {
  applyDockVisibility(dock, s);
  functionList.schedule();
  documentMap.schedule();
});
functionList.schedule();
documentMap.schedule();

const split = new SplitView({ app, panes: document.getElementById("panes")!, secondParent: document.getElementById("editor2")!, settings });

// Files dragged from Finder (or Explorer) onto the window open as tabs (spec: window-file-drop).
const stopListeningForDrops = await host.platform.onFilesDropped?.(createFileDropHandler(app));
window.addEventListener("pagehide", () => stopListeningForDrops?.());

const finder = new FindController(app);
const filesApi = inTauri ? tauriFilesApi : (host as ReturnType<typeof createBrowserHost>).filesApi;
const filesSearch = new FilesSearchController(filesApi, host.ipc, () => settings.get().largeFileThresholdBytes);
const resultsEl = document.getElementById("results")!;
const showResults: Parameters<typeof openFindDialog>[0]["showResults"] = (outcome) =>
  renderResults(
    resultsEl,
    outcome,
    async (doc, hit) => {
      if (doc.path && hit.col) {
        // Find in Files result: open the file, then jump to the line and columns.
        await app.openPath(doc.path);
        app.selectLineColumns(hit.line, hit.col.start, hit.col.end);
      } else {
        app.activateTab(doc.docId);
        app.setSelection({ from: hit.from, to: hit.to });
      }
      app.view.focus();
    },
    () => (resultsEl.hidden = true),
  );
const openFind = (tab: FindTab) =>
  openFindDialog(
    {
      controller: finder,
      selectionText: () => {
        const { from, to } = app.getSelection();
        const text = app.view.state.sliceDoc(from, to);
        return text.includes("\n") ? "" : text;
      },
      showResults,
      files: filesSearch,
      projectRoot: () => app.projectRoot,
      openFolder: () => app.openFolder(),
      pickFolder: () => host.platform.pickFolder(),
      confirmReplace: (n) => confirmDialog(`Replace in ${n} file${n === 1 ? "" : "s"}? This writes to disk.`, "Replace"),
    },
    tab,
  );

const notify = (message: string, kind: "info" | "error") => app.notify(message, kind);
const macroStore = new MacroStore(host.ipc);
await macroStore.load();
let baseCommands: Command[] = [];
const labelOf = (id: string) => baseCommands.find((c) => c.id === id)?.label ?? id;
const macros: MacroController = new MacroController({
  app,
  finder,
  store: macroStore,
  recorder: new MacroRecorder(app),
  // Playback runs the unwrapped commands: nothing is being recorded, so the recording wrapper has nothing to add.
  player: new MacroPlayer({ app, commands: () => baseCommands, finder, labelOf }),
  prompts: createMacroPrompts(macroStore, (name) => void macros.runSaved(name), notify),
  notify,
  labelOf,
});

baseCommands = createCommands({
  app,
  finder,
  settings,
  openFind,
  openSettings: () => openSettingsDialog(settings),
  split,
  macros,
  openCommandLine: () => void openCommandLineDialog({ ipc: host.ipc, copy: (text) => app.clipboard.writeText(text), notify }),
});
const commands = macros.wrapCommands(baseCommands);
// Saved macros come and go, so the menu is rebuilt whenever the list changes.
const renderMenu = () => {
  const saved = macros.savedCommands();
  renderMenuBar(document.getElementById("menubar")!, [...commands, ...saved], buildMenu(saved.map((c) => c.id)));
};
renderMenu();
macroStore.subscribe(renderMenu);
// Capture phase, so app shortcuts win over CodeMirror's default keymap for the same key.
window.addEventListener("keydown", (e) => void dispatchShortcut(e, commands), true);
