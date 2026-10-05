import { createMockIpc, type Ipc } from "../ipc";
import { DEFAULT_SETTINGS } from "../settings/model";
import { confirmDialog, confirmUnsavedDialog } from "./dialogs";
import type { FilesApi } from "../search/filesSearch";
import { createMemoryFilesApi } from "../search/memoryFilesApi";
import type { Platform } from "./platform";

/**
 * Host used when running outside Tauri (Vite dev server, Playwright). Files live
 * in memory and paths come from window.prompt, so UI flows can be exercised in WebKit.
 */
export function createBrowserHost(): { ipc: Ipc; platform: Platform; filesApi: FilesApi } {
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
    file_size: (args) => new Blob([files.get(String(args?.path)) ?? ""]).size,
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
    pickFolder: async () => window.prompt("Open folder", "/memory") || null,
    confirmUnsaved: confirmUnsavedDialog,
    confirm: confirmDialog,
  };
  // Test hook: lets e2e tests seed the in-memory file system.
  (window as unknown as { __memoryFiles: Map<string, string> }).__memoryFiles = files;
  return { ipc, platform, filesApi: createMemoryFilesApi(files) };
}
