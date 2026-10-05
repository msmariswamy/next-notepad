import { describe, expect, it, vi } from "vitest";
import { createMockIpc } from "../ipc";
import { DEFAULT_SETTINGS } from "./model";
import { SettingsStore } from "./store";

describe("SettingsStore", () => {
  it("loads settings from the backend and notifies subscribers", async () => {
    const ipc = createMockIpc({ get_settings: () => ({ ...DEFAULT_SETTINGS, silentClose: true }) });
    const store = new SettingsStore(ipc);
    const seen = vi.fn();
    store.subscribe(seen);
    await store.load();
    expect(store.get().silentClose).toBe(true);
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ silentClose: true }));
  });

  it("persists an update immediately through the backend", async () => {
    const ipc = createMockIpc({ update_settings: (a) => a?.settings });
    const store = new SettingsStore(ipc);
    await store.update({ fontSize: 16 });
    expect(ipc.calls[0]).toEqual({
      command: "update_settings",
      args: { settings: expect.objectContaining({ fontSize: 16 }) },
    });
    expect(store.get().fontSize).toBe(16);
  });

  it("applies the change to subscribers before the save finishes", async () => {
    let resolveSave!: () => void;
    const ipc = createMockIpc({ update_settings: () => new Promise<void>((r) => (resolveSave = r)) });
    const store = new SettingsStore(ipc);
    const seen = vi.fn();
    store.subscribe(seen);
    const pending = store.update({ wordWrap: true });
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ wordWrap: true }));
    resolveSave();
    await pending;
  });

  it("sanitises out-of-range values before saving", async () => {
    const ipc = createMockIpc({ update_settings: () => undefined });
    const store = new SettingsStore(ipc);
    await store.update({ fontSize: 1000 });
    expect(store.get().fontSize).toBe(72);
  });
});
