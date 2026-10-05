import { memoryClipboard } from "../app/clipboard";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockIpc, type MockIpc } from "../ipc";
import { DocumentManager } from "../docs/documentManager";
import { App } from "./app";
import { DEFAULT_SETTINGS, type Settings } from "../settings/model";
import { language } from "@codemirror/language";
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
    confirm: vi.fn(async () => true),
    clipboard: memoryClipboard(),
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
    expect(app.manager.get(id!)!.title).toBe("a.txt");
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

describe("language and highlighting", () => {
  const langName = () => app.view.state.facet(language)?.name ?? null;

  it("starts as plain text", async () => {
    await app.languageReady();
    expect(app.manager.active!.language).toBe("Normal text");
    expect(langName()).toBeNull();
  });

  it("detects the language from the file name when a file is opened", async () => {
    platform.pickOpenPath = vi.fn(async () => "/tmp/data.json");
    await app.openFileDialog();
    await app.languageReady();
    expect(app.manager.active!.language).toBe("JSON");
    expect(langName()).toBe("json");
  });

  it("lets the user pick a language for an untitled tab", async () => {
    app.setLanguage("Rust");
    await app.languageReady();
    expect(langName()).toBe("rust");
    app.setLanguage("Normal text");
    await app.languageReady();
    expect(langName()).toBeNull();
  });

  it("keeps each tab's language when switching", async () => {
    app.setLanguage("JSON");
    await app.languageReady();
    app.newTab();
    await app.languageReady();
    expect(langName()).toBeNull();
    app.activateTab(app.manager.docs[0].id);
    await app.languageReady();
    expect(langName()).toBe("json");
  });

  it("picks the language up when an untitled tab is first saved under a name", async () => {
    platform.pickSavePath = vi.fn(async () => "/tmp/notes.md");
    type("# hi");
    await app.save();
    await app.languageReady();
    expect(app.manager.active!.language).toBe("Markdown");
  });

  it("does not override a language the user chose when saving", async () => {
    platform.pickSavePath = vi.fn(async () => "/tmp/notes.md");
    app.setLanguage("Rust");
    await app.save();
    expect(app.manager.active!.language).toBe("Rust");
  });
});

describe("large file warning", () => {
  const big = 60 * 1024 * 1024;
  const withSize = (size: number | "unknown") => {
    ipc = createMockIpc({
      file_size: () => {
        if (size === "unknown") throw new Error("no size");
        return size;
      },
      open_file: () => ({ text: "x", encoding: "UTF-8", bom: false, eol: "lf" }),
    });
    build();
  };

  it("asks before opening a file above the threshold, and stops when declined", async () => {
    withSize(big);
    platform.confirm = vi.fn(async () => false);
    expect(await app.openPath("/tmp/huge.log")).toBeNull();
    expect(platform.confirm).toHaveBeenCalledWith(expect.stringContaining("60.0 MB"), "Open");
    expect(ipc.calls.some((c) => c.command === "open_file")).toBe(false);
  });

  it("opens the file when the warning is accepted", async () => {
    withSize(big);
    platform.confirm = vi.fn(async () => true);
    expect(await app.openPath("/tmp/huge.log")).not.toBeNull();
  });

  it("does not ask for a file below the threshold", async () => {
    withSize(1024);
    platform.confirm = vi.fn(async () => false);
    expect(await app.openPath("/tmp/small.txt")).not.toBeNull();
    expect(platform.confirm).not.toHaveBeenCalled();
  });

  it("uses the threshold from settings", async () => {
    withSize(2 * 1024 * 1024);
    settings = { ...DEFAULT_SETTINGS, largeFileThresholdBytes: 1024 * 1024 };
    platform.confirm = vi.fn(async () => false);
    expect(await app.openPath("/tmp/two-mb.txt")).toBeNull();
  });

  it("never blocks opening when the size cannot be determined", async () => {
    withSize("unknown");
    platform.confirm = vi.fn(async () => false);
    expect(await app.openPath("/tmp/a.txt")).not.toBeNull();
    expect(platform.confirm).not.toHaveBeenCalled();
  });
});

describe("content-based language detection", () => {
  const build2 = (delay = 0) => {
    document.body.innerHTML = '<div id="tabs"></div><div id="editor"></div><div id="status"></div>';
    app = new App({
      editorParent: document.getElementById("editor")!,
      tabsEl: document.getElementById("tabs")!,
      statusEl: document.getElementById("status")!,
      manager: new DocumentManager(),
      platform,
      ipc,
      settings: { get: () => settings, subscribe: () => () => {} },
      detectDelayMs: delay,
    });
    app.start();
  };
  const settle = () => new Promise((r) => setTimeout(r, 20));
  const insert = (t: string) => app.view.dispatch({ changes: { from: 0, to: app.view.state.doc.length, insert: t } });

  it("sets JSON for pasted JSON in an untitled tab", async () => {
    build2();
    insert('{"a": [1, 2]}');
    await settle();
    expect(app.manager.active!.language).toBe("JSON");
    await app.languageReady();
    expect(app.view.state.facet(language)?.name).toBe("json");
    expect(app.manager.active!.languageManual).toBe(false);
  });

  it.each([
    ['<?xml version="1.0"?><root><a/></root>', "XML"],
    ["<!DOCTYPE html><html><body></body></html>", "HTML"],
    ["name: app\nitems:\n  - a\n  - b", "YAML"],
    ["package a;\n\npublic class Foo {\n  public static void main(String[] args) {}\n}", "Java"],
  ])("detects %#", async (text, lang) => {
    build2();
    insert(text);
    await settle();
    expect(app.manager.active!.language).toBe(lang);
  });

  it("leaves ordinary prose as plain text", async () => {
    build2();
    insert("Meeting notes: call John tomorrow.");
    await settle();
    expect(app.manager.active!.language).toBe("Normal text");
  });

  it("never overrides a language the user chose", async () => {
    build2();
    app.setLanguage("Python");
    insert('{"a": 1}');
    await settle();
    expect(app.manager.active!.language).toBe("Python");
    expect(app.manager.active!.languageManual).toBe(true);
  });

  it("lets a file extension win over the content", async () => {
    build2();
    ipc = createMockIpc({ open_file: () => ({ text: '{"a":1}', encoding: "UTF-8", bom: false, eol: "lf" }), file_size: () => 10 });
    app = new App({
      editorParent: document.getElementById("editor")!,
      tabsEl: document.getElementById("tabs")!,
      statusEl: document.getElementById("status")!,
      manager: new DocumentManager(),
      platform,
      ipc,
      settings: { get: () => settings, subscribe: () => () => {} },
      detectDelayMs: 0,
    });
    app.start();
    await app.openPath("/tmp/notes.txt");
    await settle();
    expect(app.manager.active!.language).toBe("Normal text");
  });

  it("detects content for a file with an unrecognised extension", async () => {
    build2();
    ipc = createMockIpc({ open_file: () => ({ text: '{"a":1}', encoding: "UTF-8", bom: false, eol: "lf" }), file_size: () => 10 });
    app = new App({
      editorParent: document.getElementById("editor")!,
      tabsEl: document.getElementById("tabs")!,
      statusEl: document.getElementById("status")!,
      manager: new DocumentManager(),
      platform,
      ipc,
      settings: { get: () => settings, subscribe: () => () => {} },
      detectDelayMs: 0,
    });
    app.start();
    await app.openPath("/tmp/data.weird");
    await settle();
    expect(app.manager.active!.language).toBe("JSON");
  });

  it("waits for the debounce delay and cancels on further typing", async () => {
    vi.useFakeTimers();
    build2(300);
    insert('{"a": 1}');
    await vi.advanceTimersByTimeAsync(200);
    expect(app.manager.active!.language).toBe("Normal text");
    insert('{"a": 12}');
    await vi.advanceTimersByTimeAsync(200);
    expect(app.manager.active!.language).toBe("Normal text");
    await vi.advanceTimersByTimeAsync(200);
    expect(app.manager.active!.language).toBe("JSON");
    vi.useRealTimers();
  });

  it("does not re-run detection once a language is set", async () => {
    build2();
    insert('{"a": 1}');
    await settle();
    expect(app.manager.active!.language).toBe("JSON");
    insert("name: app\nitems:\n  - a");
    await settle();
    expect(app.manager.active!.language).toBe("JSON");
  });

  it("detectLanguageNow reports what it set, or null", () => {
    build2(10_000);
    insert('<config><item/></config>');
    expect(app.detectLanguageNow()).toBe("XML");
    insert("just words");
    app.setLanguage("Normal text"); // manual plain text
    expect(app.detectLanguageNow()).toBeNull();
  });
});

describe("caret and scroll position (spec: session-restore)", () => {
  const restoredDoc = (text: string, viewState: { anchor: number; head: number; scrollTop: number } | null) => {
    const manager = new DocumentManager();
    manager.restoreDoc({
      id: "doc-1",
      title: "new 1",
      path: null,
      text,
      savedText: "",
      eol: "lf",
      encoding: "UTF-8",
      bom: false,
      language: "Normal text",
      languageManual: false,
      metaDirty: false,
      missing: false,
      viewState,
    });
    document.body.innerHTML = '<div id="tabs"></div><div id="editor"></div><div id="status"></div>';
    const restored = new App({
      editorParent: document.getElementById("editor")!,
      tabsEl: document.getElementById("tabs")!,
      statusEl: document.getElementById("status")!,
      manager,
      platform,
      ipc,
      settings: { get: () => settings, subscribe: () => () => {} },
    });
    restored.start();
    return { restored, manager };
  };

  it("puts the caret back on a restored tab", () => {
    const { restored } = restoredDoc("line one\nline two\nline three", { anchor: 9, head: 13, scrollTop: 0 });
    expect(restored.getSelection()).toEqual({ from: 9, to: 13 });
  });

  it("clamps a saved position that is past the end of the text", () => {
    const { restored } = restoredDoc("short", { anchor: 500, head: 900, scrollTop: 0 });
    expect(restored.getSelection()).toEqual({ from: 5, to: 5 });
  });

  it("a tab restored without view state starts with the caret at the beginning", () => {
    const { restored } = restoredDoc("hello", null);
    expect(restored.getSelection()).toEqual({ from: 0, to: 0 });
  });

  it("keeps the restored scroll position in the tab until the user moves", async () => {
    const { manager } = restoredDoc("hello", { anchor: 0, head: 0, scrollTop: 77 });
    await new Promise((r) => setTimeout(r, 50));
    expect(manager.docs[0].viewState?.scrollTop).toBe(77);
  });

  it("records the caret in the tab as the user moves it", () => {
    type("hello world");
    app.setSelection({ from: 2, to: 5 });
    expect(app.manager.active!.viewState).toMatchObject({ anchor: 2, head: 5 });
  });

  it("restores the caret of a tab when switching back to it", () => {
    type("first tab text");
    app.setSelection({ from: 3, to: 3 });
    const firstId = app.manager.activeId!;
    app.newTab();
    type("second");
    app.activateTab(firstId);
    expect(app.getSelection()).toEqual({ from: 3, to: 3 });
  });
});
