import { DocumentManager } from "./docs/documentManager";
import { App } from "./app/app";
import { createBrowserHost } from "./app/browserHost";
import { tauriPlatform } from "./app/tauriPlatform";
import { tauriIpc } from "./ipc";
import { SettingsStore } from "./settings/store";
import { openSettingsDialog } from "./settings/dialog";
import { SessionClient } from "./session/client";
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

// Temporary shortcuts until the native menu bar lands (task 2.7).
window.addEventListener("keydown", (e) => {
  if (!(e.metaKey || e.ctrlKey)) return;
  const key = e.key.toLowerCase();
  if (key === ",") (e.preventDefault(), openSettingsDialog(settings));
  else if (key === "s") (e.preventDefault(), void app.save());
  else if (key === "o") (e.preventDefault(), void app.openFileDialog());
  else if (key === "n") (e.preventDefault(), app.newTab());
  else if (key === "w" && app.manager.activeId) (e.preventDefault(), void app.closeTab(app.manager.activeId));
});
