import { createMockIpc, type Ipc } from "../ipc";
import { confirmUnsavedDialog } from "./dialogs";
import type { Platform } from "./platform";

/**
 * Host used when running outside Tauri (Vite dev server, Playwright). Files live
 * in memory and paths come from window.prompt, so UI flows can be exercised in WebKit.
 */
export function createBrowserHost(): { ipc: Ipc; platform: Platform } {
  const files = new Map<string, string>();
  const ipc = createMockIpc({
    open_file: (args) => {
      const path = String(args?.path);
      if (!files.has(path)) throw new Error(`No such file: ${path}`);
      return { text: files.get(path), encoding: "UTF-8", bom: false, eol: "lf" };
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
