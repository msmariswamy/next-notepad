import { DocumentManager } from "./docs/documentManager";
import { App } from "./app/app";
import { createBrowserHost } from "./app/browserHost";
import { tauriPlatform } from "./app/tauriPlatform";
import { tauriIpc } from "./ipc";

const inTauri = "__TAURI_INTERNALS__" in window;
const host = inTauri ? { ipc: tauriIpc, platform: tauriPlatform } : createBrowserHost();

const app = new App({
  editorParent: document.getElementById("editor")!,
  tabsEl: document.getElementById("tabs")!,
  statusEl: document.getElementById("statusbar")!,
  manager: new DocumentManager(),
  platform: host.platform,
  ipc: host.ipc,
  // Settings store arrives in group 4; prompt-on-close is the spec default.
  settings: { silentClose: false },
});
app.start();
app.view.focus();

// Temporary shortcuts until the native menu bar lands (task 2.7).
window.addEventListener("keydown", (e) => {
  if (!(e.metaKey || e.ctrlKey)) return;
  const key = e.key.toLowerCase();
  if (key === "s") (e.preventDefault(), void app.save());
  else if (key === "o") (e.preventDefault(), void app.openFileDialog());
  else if (key === "n") (e.preventDefault(), app.newTab());
  else if (key === "w" && app.manager.activeId) (e.preventDefault(), void app.closeTab(app.manager.activeId));
});
