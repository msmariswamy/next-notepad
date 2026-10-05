import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockIpc, type MockIpc } from "../ipc";
import { DocumentManager } from "../docs/documentManager";
import { App } from "./app";
import { DEFAULT_SETTINGS, type Settings } from "../settings/model";
import type { Platform } from "./platform";

let ipc: MockIpc;
let platform: Platform;
let settings: Settings;
let app: App;

function build() {
  document.body.innerHTML = '<div id="tabs"></div><div id="editor"></div><div id="status"></div>';
  app = new App({
    editorParent: document.getElementById("editor")!,
    tabsEl: document.getElementById("tabs")!,
    statusEl: document.getElementById("status")!,
    manager: new DocumentManager(),
    platform,
    ipc,
    settings: { get: () => settings, subscribe: () => () => {} },
  });
  app.start();
}

const type = (text: string) => app.view.dispatch({ changes: { from: app.view.state.doc.length, insert: text } });

beforeEach(() => {
  ipc = createMockIpc({
    save_file_cmd: () => undefined,
    open_file: () => ({ text: "from disk", encoding: "UTF-8", bom: false, eol: "lf" }),
  });
  platform = {
    pickOpenPath: vi.fn(async () => "/tmp/opened.txt"),
    pickSavePath: vi.fn(async () => "/tmp/saved.txt"),
    pickFolder: vi.fn(async () => "/tmp/proj"),
    confirmUnsaved: vi.fn(async () => "cancel" as const),
  };
  settings = { ...DEFAULT_SETTINGS };
  build();
});

describe("app", () => {
  it("starts with one untitled tab", () => {
    expect(app.manager.docs.map((d) => d.title)).toEqual(["new 1"]);
  });

  it("marks the tab dirty when typing", () => {
    type("hi");
    expect(app.manager.active!.dirty).toBe(true);
  });

  it("keeps each tab's text when switching", () => {
    type("first");
    app.newTab();
    type("second");
    app.activateTab(app.manager.docs[0].id);
    expect(app.view.state.doc.toString()).toBe("first");
    app.activateTab(app.manager.docs[1].id);
    expect(app.view.state.doc.toString()).toBe("second");
  });

  it("opens a file into a new tab", async () => {
    await app.openFileDialog();
    expect(ipc.calls.find((c) => c.command === "open_file")?.args).toEqual({ path: "/tmp/opened.txt" });
    expect(app.manager.active!.title).toBe("opened.txt");
    expect(app.view.state.doc.toString()).toBe("from disk");
  });

  it("saves an untitled tab through a save dialog and clears dirty", async () => {
    type("note");
    await app.save();
    expect(platform.pickSavePath).toHaveBeenCalled();
    expect(ipc.calls.find((c) => c.command === "save_file_cmd")?.args).toMatchObject({
      path: "/tmp/saved.txt",
      text: "note",
      encoding: "UTF-8",
      eol: "lf",
    });
    expect(app.manager.active!.dirty).toBe(false);
    expect(app.manager.active!.title).toBe("saved.txt");
  });

  it("saves a bound tab without asking for a path", async () => {
    await app.openFileDialog();
    type("!");
    await app.save();
    expect(platform.pickSavePath).not.toHaveBeenCalled();
    expect(app.manager.active!.dirty).toBe(false);
  });

  it("keeps the tab dirty when the save dialog is cancelled", async () => {
    platform.pickSavePath = vi.fn(async () => null);
    type("note");
    await app.save();
    expect(app.manager.active!.dirty).toBe(true);
  });
});

describe("closing tabs", () => {
  it("closes a clean tab without a prompt and always leaves one tab", async () => {
    await app.closeTab(app.manager.docs[0].id);
    expect(platform.confirmUnsaved).not.toHaveBeenCalled();
    expect(app.manager.docs.length).toBe(1);
  });

  it("prompts for a dirty tab and keeps it when cancelled", async () => {
    type("x");
    await app.closeTab(app.manager.docs[0].id);
    expect(platform.confirmUnsaved).toHaveBeenCalledWith("new 1");
    expect(app.manager.docs[0].text).toBe("x");
  });

  it("discards a dirty tab on Don't Save", async () => {
    platform.confirmUnsaved = vi.fn(async () => "discard" as const);
    type("x");
    const id = app.manager.docs[0].id;
    await app.closeTab(id);
    expect(app.manager.get(id)).toBeUndefined();
  });

  it("saves then closes on Save", async () => {
    platform.confirmUnsaved = vi.fn(async () => "save" as const);
    type("x");
    const id = app.manager.docs[0].id;
    await app.closeTab(id);
    expect(ipc.calls.some((c) => c.command === "save_file_cmd")).toBe(true);
    expect(app.manager.get(id)).toBeUndefined();
  });

  it("keeps the tab if Save is chosen but the save dialog is cancelled", async () => {
    platform.confirmUnsaved = vi.fn(async () => "save" as const);
    platform.pickSavePath = vi.fn(async () => null);
    type("x");
    const id = app.manager.docs[0].id;
    await app.closeTab(id);
    expect(app.manager.get(id)).toBeDefined();
  });

  it("closes a dirty tab silently when silentClose is on, keeping its text recoverable", async () => {
    settings.silentClose = true;
    type("keep me");
    await app.closeTab(app.manager.docs[0].id);
    expect(platform.confirmUnsaved).not.toHaveBeenCalled();
    expect(app.manager.recentlyClosed[0].text).toBe("keep me");
  });
});

describe("quitting", () => {
  it("quits without prompting when nothing is dirty", async () => {
    expect(await app.requestQuit()).toBe(true);
    expect(platform.confirmUnsaved).not.toHaveBeenCalled();
  });

  it("prompts per dirty tab and aborts the quit on Cancel", async () => {
    type("x");
    expect(await app.requestQuit()).toBe(false);
    expect(platform.confirmUnsaved).toHaveBeenCalledWith("new 1");
  });

  it("saves then quits when Save is chosen", async () => {
    platform.confirmUnsaved = vi.fn(async () => "save" as const);
    type("x");
    expect(await app.requestQuit()).toBe(true);
    expect(ipc.calls.some((c) => c.command === "save_file_cmd")).toBe(true);
  });

  it("does not quit if Save is chosen but the save dialog is cancelled", async () => {
    platform.confirmUnsaved = vi.fn(async () => "save" as const);
    platform.pickSavePath = vi.fn(async () => null);
    type("x");
    expect(await app.requestQuit()).toBe(false);
  });

  it("does not prompt when silentClose is on and runs the quit hook", async () => {
    settings.silentClose = true;
    const onQuit = vi.fn(async () => {});
    app = new App({
      editorParent: document.getElementById("editor")!,
      tabsEl: document.getElementById("tabs")!,
      statusEl: document.getElementById("status")!,
      manager: new DocumentManager(),
      platform,
      ipc,
      settings: { get: () => settings, subscribe: () => () => {} },
      onQuit,
    });
    app.start();
    type("unsaved");
    expect(await app.requestQuit()).toBe(true);
    expect(platform.confirmUnsaved).not.toHaveBeenCalled();
    expect(onQuit).toHaveBeenCalled();
  });
});

describe("editing helpers used by Find/Replace", () => {
  it("reports and sets the selection", () => {
    type("hello");
    app.setSelection({ from: 1, to: 3 });
    expect(app.getSelection()).toEqual({ from: 1, to: 3 });
  });

  it("applies changes to the shown tab as one undo step", () => {
    type("x x x");
    app.applyChangesToDoc(app.manager.docs[0].id, [
      { from: 0, to: 1, insert: "y" },
      { from: 2, to: 3, insert: "y" },
    ]);
    expect(app.view.state.doc.toString()).toBe("y y x");
    expect(app.manager.docs[0].text).toBe("y y x");
  });

  it("applies changes to a background tab and marks it modified", () => {
    type("first");
    const firstId = app.manager.docs[0].id;
    app.newTab();
    app.applyChangesToDoc(firstId, [{ from: 0, to: 5, insert: "FIRST" }]);
    expect(app.manager.get(firstId)!.text).toBe("FIRST");
    expect(app.manager.get(firstId)!.dirty).toBe(true);
    app.activateTab(firstId);
    expect(app.view.state.doc.toString()).toBe("FIRST");
  });
});

describe("project folder and result navigation", () => {
  it("remembers the folder chosen with Open Folder", async () => {
    expect(app.projectRoot).toBeNull();
    expect(await app.openFolder()).toBe("/tmp/proj");
    expect(app.projectRoot).toBe("/tmp/proj");
  });

  it("keeps the previous folder when the picker is cancelled", async () => {
    await app.openFolder();
    platform.pickFolder = vi.fn(async () => null);
    await app.openFolder();
    expect(app.projectRoot).toBe("/tmp/proj");
  });

  it("opens a file by path and re-uses its tab the second time", async () => {
    const id = await app.openPath("/tmp/proj/a.txt");
    expect(app.manager.get(id)!.title).toBe("a.txt");
    const again = await app.openPath("/tmp/proj/a.txt");
    expect(again).toBe(id);
    expect(ipc.calls.filter((c) => c.command === "open_file").length).toBe(1);
  });

  it("selects a match by line and column", async () => {
    await app.openPath("/tmp/proj/a.txt"); // mock returns "from disk"
    app.selectLineColumns(1, 5, 9);
    expect(app.getSelection()).toEqual({ from: 5, to: 9 });
  });

  it("clamps a column beyond the end of the line", async () => {
    await app.openPath("/tmp/proj/a.txt");
    app.selectLineColumns(99, 0, 500);
    expect(app.getSelection().to).toBe(app.view.state.doc.length);
  });
});
