import { open, save } from "@tauri-apps/plugin-dialog";
import { confirmDialog, confirmUnsavedDialog } from "./dialogs";
import type { Platform } from "./platform";

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
};
