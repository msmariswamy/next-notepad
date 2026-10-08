import { open, save } from "@tauri-apps/plugin-dialog";
import { confirmDialog, confirmUnsavedDialog } from "./dialogs";
import type { Platform } from "./platform";
import { webClipboard } from "./clipboard";

export const tauriPlatform: Platform = {
  async pickOpenPath() {
    const picked = await open({ multiple: false, directory: false });
    return typeof picked === "string" ? picked : null;
  },
  async pickFolder() {
    const picked = await open({ multiple: false, directory: true });
    return typeof picked === "string" ? picked : null;
  },
  pickSavePath: (suggestedName) => save({ defaultPath: suggestedName }),
  confirmUnsaved: confirmUnsavedDialog,
  confirm: confirmDialog,
  clipboard: webClipboard,
  async onFilesDropped(handler) {
    // Tauri hides OS file paths from HTML5 drop events; the webview's own drag-drop event is the only source of real
    // paths. It only yields paths, so reading the files still goes through the `open_file` command (ADR-0002).
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    return getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "drop" && event.payload.paths.length > 0) handler(event.payload.paths);
    });
  },
};
