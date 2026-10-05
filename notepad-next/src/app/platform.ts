export interface ClipboardApi {
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
}

export type UnsavedChoice = "save" | "discard" | "cancel";

/** Native services the app needs. Faked in unit/e2e tests; backed by Tauri in the real app. */
export interface Platform {
  pickOpenPath(): Promise<string | null>;
  pickSavePath(suggestedName: string): Promise<string | null>;
  pickFolder(): Promise<string | null>;
  confirmUnsaved(title: string): Promise<UnsavedChoice>;
  /** Generic OK / Cancel question. */
  confirm(message: string, okLabel: string): Promise<boolean>;
  clipboard: ClipboardApi;
}
