import { memoryClipboard } from "../app/clipboard";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { undo } from "@codemirror/commands";
import { App } from "../app/app";
import { DocumentManager } from "../docs/documentManager";
import { createMockIpc } from "../ipc";
import { DEFAULT_SETTINGS } from "../settings/model";
import { runJsonCommand } from "./jsonCommands";

let app: App;
let notify: ReturnType<typeof vi.fn<(message: string, kind: "info" | "error") => void>>;

beforeEach(() => {
  document.body.innerHTML = '<div id="tabs"></div><div id="editor"></div><div id="status"></div>';
  notify = vi.fn<(message: string, kind: "info" | "error") => void>();
  app = new App({
    editorParent: document.getElementById("editor")!,
    tabsEl: document.getElementById("tabs")!,
    statusEl: document.getElementById("status")!,
    manager: new DocumentManager(),
    platform: { pickOpenPath: vi.fn(), pickSavePath: vi.fn(), pickFolder: vi.fn(), confirmUnsaved: vi.fn(), confirm: vi.fn(), clipboard: memoryClipboard() },
    ipc: createMockIpc({}),
    settings: { get: () => DEFAULT_SETTINGS, subscribe: () => () => {} },
    notify,
  });
  app.start();
});

const setText = (t: string) => app.view.dispatch({ changes: { from: 0, to: app.view.state.doc.length, insert: t }, selection: { anchor: 0 } });
const text = () => app.view.state.doc.toString();

describe("JSON commands", () => {
  it("pretty-prints the whole document", () => {
    setText('{"a":1,"b":[1,2]}');
    expect(runJsonCommand(app, "pretty")).toEqual({ ok: true, message: "JSON formatted" });
    expect(text()).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}');
  });

  it("minifies the whole document", () => {
    setText('{\n  "a": 1\n}');
    runJsonCommand(app, "minify");
    expect(text()).toBe('{"a":1}');
  });

  it("formats only the selection when there is one", () => {
    setText('x {"a":1} y');
    app.setSelection({ from: 2, to: 9 });
    runJsonCommand(app, "pretty");
    expect(text()).toBe('x {\n  "a": 1\n} y');
  });

  it("leaves invalid JSON untouched and moves the caret to the error", () => {
    setText('{\n  "a": 1\n  "b": 2\n}');
    const r = runJsonCommand(app, "pretty");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/^Line 3, column 3:/);
    expect(text()).toBe('{\n  "a": 1\n  "b": 2\n}');
    expect(app.getSelection().from).toBe(text().indexOf('"b"'));
  });

  it("maps the error position back when only a selection is processed", () => {
    setText('abc {"a": } def');
    app.setSelection({ from: 4, to: 11 });
    runJsonCommand(app, "validate");
    expect(app.getSelection().from).toBe(4 + '{"a": '.length);
  });

  it("validate reports valid JSON", () => {
    setText('{"ok":true}');
    expect(runJsonCommand(app, "validate")).toEqual({ ok: true, message: "JSON is valid" });
    expect(notify).toHaveBeenCalledWith("JSON is valid", "info");
  });

  it("notifies errors with kind 'error'", () => {
    setText("{");
    runJsonCommand(app, "validate");
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Line 1"), "error");
  });

  it("formatting is a single undo step", () => {
    setText('{"a":1}');
    runJsonCommand(app, "pretty");
    undo(app.view);
    expect(text()).toBe('{"a":1}');
  });

  it("does not mark the tab modified when the text is already formatted that way", () => {
    setText('{"a":1}');
    app.manager.markSaved(app.manager.activeId!);
    runJsonCommand(app, "minify");
    expect(app.manager.active!.dirty).toBe(false);
  });
});

describe("encoding, line ending and save-as helpers", () => {
  it("changing the line ending marks the tab modified", () => {
    app.setEol("crlf");
    expect(app.manager.active).toMatchObject({ eol: "crlf", dirty: true });
  });

  it("changing the encoding is applied on save", async () => {
    const ipc = createMockIpc({ save_file_cmd: () => undefined });
    const a = new App({
      editorParent: document.getElementById("editor")!,
      tabsEl: document.getElementById("tabs")!,
      statusEl: document.getElementById("status")!,
      manager: new DocumentManager(),
      platform: { pickOpenPath: vi.fn(), pickSavePath: vi.fn(async () => "/x.txt"), pickFolder: vi.fn(), confirmUnsaved: vi.fn(), confirm: vi.fn(), clipboard: memoryClipboard() },
      ipc,
      settings: { get: () => DEFAULT_SETTINGS, subscribe: () => () => {} },
    });
    a.start();
    a.setEncoding("UTF-16LE", true);
    await a.save();
    expect(ipc.calls[0].args).toMatchObject({ encoding: "UTF-16LE", bom: true });
  });

  it("Save As always asks for a path, even for a bound tab", async () => {
    const pick = vi.fn(async () => "/new/place.txt");
    const ipc = createMockIpc({ save_file_cmd: () => undefined, open_file: () => ({ text: "x", encoding: "UTF-8", bom: false, eol: "lf" }) });
    const a = new App({
      editorParent: document.getElementById("editor")!,
      tabsEl: document.getElementById("tabs")!,
      statusEl: document.getElementById("status")!,
      manager: new DocumentManager(),
      platform: { pickOpenPath: vi.fn(), pickSavePath: pick, pickFolder: vi.fn(), confirmUnsaved: vi.fn(), confirm: vi.fn(), clipboard: memoryClipboard() },
      ipc,
      settings: { get: () => DEFAULT_SETTINGS, subscribe: () => () => {} },
    });
    a.start();
    await a.openPath("/old.txt");
    await a.saveAs();
    expect(pick).toHaveBeenCalled();
    expect(a.manager.active!.path).toBe("/new/place.txt");
  });

  it("reports a failed save and keeps the tab modified", async () => {
    const errors = vi.fn<(message: string, kind: "info" | "error") => void>();
    const a = new App({
      editorParent: document.getElementById("editor")!,
      tabsEl: document.getElementById("tabs")!,
      statusEl: document.getElementById("status")!,
      manager: new DocumentManager(),
      platform: { pickOpenPath: vi.fn(), pickSavePath: vi.fn(async () => "/x.txt"), pickFolder: vi.fn(), confirmUnsaved: vi.fn(), confirm: vi.fn(), clipboard: memoryClipboard() },
      ipc: createMockIpc({ save_file_cmd: () => { throw new Error("not representable"); } }),
      settings: { get: () => DEFAULT_SETTINGS, subscribe: () => () => {} },
      notify: errors,
    });
    a.start();
    a.view.dispatch({ changes: { from: 0, insert: "日本" } });
    expect(await a.save()).toBe(false);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("Could not save"), "error");
    expect(a.manager.active!.dirty).toBe(true);
  });
});
