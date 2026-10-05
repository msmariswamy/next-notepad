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
import { restoreSession } from "./session/snapshot";

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
// Shortcuts have no message area; an invalid regex is reported by the dialog, so just ignore it here.
const runQuietly = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
  }
};
const resultsEl = document.getElementById("results")!;
const showResults: Parameters<typeof openFindDialog>[0]["showResults"] = (outcome) =>
  renderResults(
    resultsEl,
    outcome,
    (docId, from, to) => {
      app.activateTab(docId);
      app.setSelection({ from, to });
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
    },
    tab,
  );

// Temporary shortcuts until the native menu bar lands (task 2.7).
window.addEventListener("keydown", (e) => {
  if (!(e.metaKey || e.ctrlKey)) return;
  const key = e.key.toLowerCase();
  if (key === "f" && !e.shiftKey) (e.preventDefault(), openFind("find"));
  else if (key === "h") (e.preventDefault(), openFind("replace"));
  else if (key === "g") (e.preventDefault(), runQuietly(() => finder.findNext({ backward: e.shiftKey })));
  else if (key === ",") (e.preventDefault(), openSettingsDialog(settings));
  else if (key === "s") (e.preventDefault(), void app.save());
  else if (key === "o") (e.preventDefault(), void app.openFileDialog());
  else if (key === "n") (e.preventDefault(), app.newTab());
  else if (key === "w" && app.manager.activeId) (e.preventDefault(), void app.closeTab(app.manager.activeId));
});
