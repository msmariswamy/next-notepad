import type { ClipboardApi } from "./platform";

/** System clipboard through the webview's async Clipboard API. */
export const webClipboard: ClipboardApi = {
  readText: () => navigator.clipboard.readText(),
  writeText: (text) => navigator.clipboard.writeText(text),
};

/** In-memory clipboard for tests and environments without clipboard permission. */
export function memoryClipboard(initial = ""): ClipboardApi & { value: string } {
  const c = {
    value: initial,
    readText: async () => c.value,
    writeText: async (t: string) => void (c.value = t),
  };
  return c;
}
