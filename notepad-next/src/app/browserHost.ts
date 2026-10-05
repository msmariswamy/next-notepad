import { createMockIpc, type Ipc } from "../ipc";
import { DEFAULT_SETTINGS } from "../settings/model";
import { confirmUnsavedDialog } from "./dialogs";
import type { Platform } from "./platform";

/**
 * Host used when running outside Tauri (Vite dev server, Playwright). Files live
 * in memory and paths come from window.prompt, so UI flows can be exercised in WebKit.
 */
export function createBrowserHost(): { ipc: Ipc; platform: Platform } {
  const files = new Map<string, string>();
  let settings = { ...DEFAULT_SETTINGS };
  const ipc = createMockIpc({
    open_file: (args) => {
      const path = String(args?.path);
      if (!files.has(path)) throw new Error(`No such file: ${path}`);
      return { text: files.get(path), encoding: "UTF-8", bom: false, eol: "lf" };
    },
    save_session: (args) => {
      localStorage.setItem("notepad-next.session", JSON.stringify(args?.snapshot));
    },
    load_session: () => {
      const raw = localStorage.getItem("notepad-next.session");
      return raw ? JSON.parse(raw) : { tabs: [], activeId: null, recentlyClosed: [] };
    },
    get_settings: () => settings,
    update_settings: (args) => {
      settings = args?.settings as typeof settings;
      return settings;
    },
    save_file_cmd: (args) => {
      files.set(String(args?.path), String(args?.text));
    },
  });
  const platform: Platform = {
    pickOpenPath: async () => window.prompt("Open path") || null,
    pickSavePath: async (name) => window.prompt("Save as", `/memory/${name}`) || null,
    confirmUnsaved: confirmUnsavedDialog,
  };
  return { ipc, platform };
}
