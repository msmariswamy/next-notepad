import { Channel, invoke } from "@tauri-apps/api/core";
import type { FilesApi, FindEvent, FindRequest, FindSummary, ReplaceSummary } from "./filesSearch";

export const tauriFilesApi: FilesApi = {
  search(jobId, request: FindRequest, onEvent: (e: FindEvent) => void) {
    const channel = new Channel<FindEvent>();
    channel.onmessage = onEvent;
    return invoke<FindSummary>("find_in_files", { jobId, request, onEvent: channel });
  },
  replace: (jobId, request, replacement) => invoke<ReplaceSummary>("replace_in_files", { jobId, request, replacement }),
  cancel: (jobId) => invoke<void>("cancel_find", { jobId }),
};
