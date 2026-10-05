import { describe, expect, it, vi } from "vitest";
import { createMockIpc } from "../ipc";
import type { Macro, MacroFile } from "./model";
import { MacroStore } from "./store";

const macro = (name: string, text = "x"): Macro => ({ name, steps: [{ type: "text", insert: text, before: 0, after: 0 }] });

function storeWith(file: unknown, onSave: (f: MacroFile) => void = () => {}) {
  const ipc = createMockIpc({
    load_macros: () => file,
    save_macros: (args) => onSave(args?.file as MacroFile),
  });
  return { ipc, store: new MacroStore(ipc) };
}

describe("MacroStore", () => {
  it("loads saved macros", async () => {
    const { store } = storeWith({ version: 1, macros: [macro("a"), macro("b")] });
    await store.load();
    expect(store.list().map((m) => m.name)).toEqual(["a", "b"]);
  });

  it("starts empty when loading fails", async () => {
    const ipc = createMockIpc({
      load_macros: () => {
        throw new Error("disk");
      },
    });
    const store = new MacroStore(ipc);
    await store.load();
    expect(store.list()).toEqual([]);
  });

  it("saves a new macro and persists the whole file", async () => {
    const saved: MacroFile[] = [];
    const { store } = storeWith({ version: 1, macros: [macro("a")] }, (f) => saved.push(f));
    await store.load();
    await store.save(macro("b"));
    expect(store.list().map((m) => m.name)).toEqual(["a", "b"]);
    expect(saved[saved.length - 1]).toEqual({ version: 1, macros: [macro("a"), macro("b")] });
  });

  it("saving under an existing name replaces that macro", async () => {
    const { store } = storeWith({ version: 1, macros: [macro("a", "old")] });
    await store.load();
    await store.save(macro("a", "new"));
    expect(store.list()).toEqual([macro("a", "new")]);
  });

  it("rejects an empty name", async () => {
    const { store } = storeWith({ version: 1, macros: [] });
    await store.load();
    await expect(store.save(macro("   "))).rejects.toThrow(/name/i);
  });

  it("renames, keeping the steps and position", async () => {
    const saved: MacroFile[] = [];
    const { store } = storeWith({ version: 1, macros: [macro("a"), macro("b")] }, (f) => saved.push(f));
    await store.load();
    await store.rename("a", "renamed");
    expect(store.list().map((m) => m.name)).toEqual(["renamed", "b"]);
    expect(saved[saved.length - 1].macros[0].steps).toEqual(macro("a").steps);
  });

  it("refuses to rename onto another macro's name or an unknown macro", async () => {
    const { store } = storeWith({ version: 1, macros: [macro("a"), macro("b")] });
    await store.load();
    await expect(store.rename("a", "b")).rejects.toThrow(/exists/i);
    await expect(store.rename("nope", "z")).rejects.toThrow(/not found/i);
    expect(store.list().map((m) => m.name)).toEqual(["a", "b"]);
  });

  it("deletes a macro", async () => {
    const saved: MacroFile[] = [];
    const { store } = storeWith({ version: 1, macros: [macro("a"), macro("b")] }, (f) => saved.push(f));
    await store.load();
    await store.remove("a");
    expect(store.list().map((m) => m.name)).toEqual(["b"]);
    expect(saved[saved.length - 1].macros.map((m) => m.name)).toEqual(["b"]);
  });

  it("notifies subscribers after a change", async () => {
    const { store } = storeWith({ version: 1, macros: [] });
    await store.load();
    const fn = vi.fn();
    store.subscribe(fn);
    await store.save(macro("a"));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("keeps the list unchanged when persisting fails", async () => {
    const { store } = storeWith({ version: 1, macros: [macro("a")] }, () => {
      throw new Error("disk full");
    });
    await store.load();
    await expect(store.save(macro("b"))).rejects.toThrow(/disk full/);
    expect(store.list().map((m) => m.name)).toEqual(["a"]);
  });

  it("does not overwrite a file written by a newer version", async () => {
    const saved: MacroFile[] = [];
    const { store } = storeWith({ version: 99, macros: [] }, (f) => saved.push(f));
    await store.load();
    await expect(store.save(macro("a"))).rejects.toThrow(/newer|version/i);
    expect(saved).toEqual([]);
  });

  it("drops unreadable macros on load but keeps the rest", async () => {
    const { store } = storeWith({ version: 1, macros: [macro("ok"), { name: "bad", steps: [{ type: "nope" }] }] });
    await store.load();
    expect(store.list().map((m) => m.name)).toEqual(["ok"]);
  });
});
