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
import { createCommands } from "./app/commands";
import { dispatchShortcut, renderMenuBar } from "./app/menuBar";
import { createToaster } from "./app/toast";
import { restoreSession } from "./session/snapshot";

installPalette();
const inTauri = "__TAURI_INTERNALS__" in window;
const host = inTauri ? { ipc: tauriIpc, platform: tauriPlatform } : createBrowserHost();

const settings = new SettingsStore(host.ipc);
await settings.load();

const manager = new DocumentManager();
// Restore before the app renders so the first paint already shows the saved tabs.
await restoreSession(manager, host.ipc).catch((e) => console.error("session restore failed", e));
const session = new SessionClient(manager, host.ipc);

const app = new App({
  editorParent: document.getElementById("editor")!,
  tabsEl: document.getElementById("tabs")!,
  statusEl: document.getElementById("statusbar")!,
  manager,
  platform: host.platform,
  ipc: host.ipc,
  settings,
  onQuit: () => session.flush(),
  notify: createToaster(document.getElementById("toast")!),
});
app.start();
session.start();
app.view.focus();

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

const commands = createCommands({
  app,
  finder,
  settings,
  openFind,
  openSettings: () => openSettingsDialog(settings),
});
renderMenuBar(document.getElementById("menubar")!, commands);
// Capture phase, so app shortcuts win over CodeMirror's default keymap for the same key.
window.addEventListener("keydown", (e) => void dispatchShortcut(e, commands), true);
