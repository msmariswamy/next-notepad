import type { Ipc } from "../ipc";
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings, type SettingsSource } from "./model";

/** Frontend view of the settings persisted by the Rust backend; every change is saved immediately. */
export class SettingsStore implements SettingsSource {
  private current: Settings = { ...DEFAULT_SETTINGS };
  private listeners = new Set<(s: Settings) => void>();

  constructor(private ipc: Ipc) {}

  async load(): Promise<Settings> {
    this.current = sanitizeSettings(await this.ipc.invoke<Settings>("get_settings"));
    this.listeners.forEach((fn) => fn(this.current));
    return this.current;
  }

  get(): Settings {
    return this.current;
  }

  async update(patch: Partial<Settings>): Promise<Settings> {
    const next = sanitizeSettings({ ...this.current, ...patch });
    this.current = next;
    this.listeners.forEach((fn) => fn(next)); // apply immediately; persist after
    await this.ipc.invoke("update_settings", { settings: next });
    return next;
  }

  subscribe(fn: (s: Settings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
