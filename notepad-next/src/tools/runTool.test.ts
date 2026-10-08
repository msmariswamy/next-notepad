import { undo } from "@codemirror/commands";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../app/app";
import { memoryClipboard } from "../app/clipboard";
import { DocumentManager } from "../docs/documentManager";
import { createMockIpc } from "../ipc";
import { DEFAULT_SETTINGS } from "../settings/model";
import { runConvert, runTool, type ToolResult } from "./runTool";

let app: App;
let notify: ReturnType<typeof vi.fn<(m: string, k: "info" | "error") => void>>;

beforeEach(() => {
  document.body.innerHTML = '<div id="tabs"></div><div id="editor"></div><div id="status"></div>';
  notify = vi.fn();
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

const setText = (t: string, anchor = 0, head = anchor) =>
  app.view.dispatch({ changes: { from: 0, to: app.view.state.doc.length, insert: t }, selection: { anchor, head } });
const doc = () => app.view.state.doc.toString();
const upper = (text: string): ToolResult => ({ ok: true, text: text.toUpperCase() });

describe("runTool", () => {
  it("transforms the whole document when nothing is selected", async () => {
    setText("abc");
    const r = await runTool(app, { language: "XML", success: "Done", run: upper });
    expect(r.ok).toBe(true);
    expect(doc()).toBe("ABC");
    expect(notify).toHaveBeenLastCalledWith("Done", "info");
  });

  it("transforms only the selection", async () => {
    setText("abc def", 4, 7);
    await runTool(app, { language: "XML", success: "Done", run: upper });
    expect(doc()).toBe("abc DEF");
  });

  it("tells the transform whether it got a selection", async () => {
    setText("abc def", 4, 7);
    const run = vi.fn((t: string): ToolResult => ({ ok: true, text: t }));
    await runTool(app, { language: "XML", success: "Done", run });
    expect(run).toHaveBeenCalledWith("def", { selection: true });
    setText("abc");
    await runTool(app, { language: "XML", success: "Done", run });
    expect(run).toHaveBeenLastCalledWith("abc", { selection: false });
  });

  it("is one undo step", async () => {
    setText("abc");
    await runTool(app, { language: "XML", success: "Done", run: upper });
    undo(app.view);
    expect(doc()).toBe("abc");
  });

  it("leaves the text unchanged and reports the error with its position", async () => {
    setText("one\ntwo\nthree");
    const r = await runTool(app, { language: "XML", success: "Done", errorPrefix: "Cannot compact XML", run: () => ({ ok: false, message: "bad tag", line: 2, column: 3 }) });
    expect(r.ok).toBe(false);
    expect(doc()).toBe("one\ntwo\nthree");
    expect(notify).toHaveBeenLastCalledWith("Cannot compact XML: Line 2, column 3: bad tag", "error");
  });

  it("moves the caret to the error", async () => {
    setText("one\ntwo\nthree");
    await runTool(app, { language: "XML", success: "Done", run: () => ({ ok: false, message: "bad", line: 2, column: 2 }) });
    expect(app.getSelection()).toEqual({ from: 5, to: 5 });
  });

  it("maps an error inside a selection back to the document's line and column", async () => {
    setText("head\n  <a>\n  <b>", 7, 16); // selects "<a>\n  <b>" starting on line 2, column 3
    await runTool(app, { language: "XML", success: "Done", run: () => ({ ok: false, message: "bad", line: 2, column: 4 }) });
    expect(notify).toHaveBeenLastCalledWith("Line 3, column 4: bad", "error");
    expect(app.getSelection()).toEqual({ from: 14, to: 14 });
  });

  it("reports an error without a position as the message alone", async () => {
    setText("x");
    await runTool(app, { language: "XML", success: "Done", run: () => ({ ok: false, message: "nope" }) });
    expect(notify).toHaveBeenLastCalledWith("nope", "error");
  });

  it("appends warnings to the success message", async () => {
    setText("x");
    await runTool(app, { language: "YAML", success: "Compacted", run: (t) => ({ ok: true, text: t, warnings: ["comments were dropped"] }) });
    expect(notify).toHaveBeenLastCalledWith("Compacted. Note: comments were dropped", "info");
  });

  it("uses a transform's own message over the default", async () => {
    setText("x");
    await runTool(app, { language: "XML", success: "Done", run: (t) => ({ ok: true, text: t, message: "XML is valid" }) });
    expect(notify).toHaveBeenLastCalledWith("XML is valid", "info");
  });

  it("does not touch the document for inspect-only commands such as Validate", async () => {
    setText("abc");
    await runTool(app, { language: "XML", success: "Valid", inspectOnly: true, run: () => ({ ok: true, text: "CHANGED" }) });
    expect(doc()).toBe("abc");
  });

  it("works with an async transform and aborts if the document changed meanwhile", async () => {
    setText("abc");
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const pending = runTool(app, { language: "YAML", success: "Done", run: async (t) => (await gate, { ok: true, text: t.toUpperCase() }) });
    setText("changed while waiting");
    release();
    const r = await pending;
    expect(r.ok).toBe(false);
    expect(doc()).toBe("changed while waiting");
    expect(notify).toHaveBeenLastCalledWith(expect.stringMatching(/changed while/i), "error");
  });

  it("switches a Normal text tab to the tool's language", async () => {
    setText("abc");
    await runTool(app, { language: "XML", success: "Done", run: upper });
    expect(app.manager.active!.language).toBe("XML");
  });

  it("keeps a language the user chose", async () => {
    setText("abc");
    app.setLanguage("Python");
    await runTool(app, { language: "XML", success: "Done", run: upper });
    expect(app.manager.active!.language).toBe("Python");
  });

  it("switches an untitled tab whose language was only guessed from its content", async () => {
    setText("<a><b/></a>");
    app.manager.setLanguage(app.manager.activeId!, "HTML");
    await runTool(app, { language: "XML", success: "Done", run: upper });
    expect(app.manager.active!.language).toBe("XML");
  });

  it("keeps the language of a tab that belongs to a file", async () => {
    app.manager.openFile("/work/page.html", { text: "<a/>", encoding: "UTF-8", bom: false, eol: "lf" });
    app.manager.setLanguage(app.manager.activeId!, "HTML");
    await runTool(app, { language: "XML", success: "Done", run: upper });
    expect(app.manager.active!.language).toBe("HTML");
  });

  it("does not switch the language when the tool failed", async () => {
    setText("abc");
    await runTool(app, { language: "XML", success: "Done", run: () => ({ ok: false, message: "bad" }) });
    expect(app.manager.active!.language).toBe("Normal text");
  });

  it("does nothing without a document", async () => {
    app.manager.docs.length = 0;
    app.manager.activeId = null;
    const r = await runTool(app, { language: "XML", success: "Done", run: upper });
    expect(r.ok).toBe(false);
  });
});

describe("runConvert", () => {
  const convert = (text: string): ToolResult => ({ ok: true, text: `[${text}]` });

  it("opens the result in a new untitled tab with the target language and leaves the source alone", async () => {
    setText("abc");
    const sourceId = app.manager.activeId!;
    const r = await runConvert(app, { target: "YAML", success: "Converted to YAML", run: convert });
    expect(r.ok).toBe(true);
    expect(app.manager.docs).toHaveLength(2);
    expect(app.manager.activeId).not.toBe(sourceId);
    expect(doc()).toBe("[abc]");
    expect(app.manager.active!.language).toBe("YAML");
    expect(app.manager.get(sourceId)!.text).toBe("abc");
    expect(notify).toHaveBeenLastCalledWith("Converted to YAML", "info");
  });

  it("converts only the selection", async () => {
    setText("one two", 4, 7);
    await runConvert(app, { target: "JSON", success: "ok", run: convert });
    expect(doc()).toBe("[two]");
  });

  it("marks the new tab's language as chosen so detection never overrides it", async () => {
    setText("abc");
    await runConvert(app, { target: "JSON", success: "ok", run: convert });
    expect(app.manager.active!.languageManual).toBe(true);
  });

  it("opens no tab and reports the position on error", async () => {
    setText("abc");
    const r = await runConvert(app, { target: "JSON", success: "ok", run: () => ({ ok: false, message: "bad", line: 1, column: 2 }) });
    expect(r.ok).toBe(false);
    expect(app.manager.docs).toHaveLength(1);
    expect(notify).toHaveBeenLastCalledWith("Line 1, column 2: bad", "error");
  });

  it("shows one toast listing warnings and still opens the tab", async () => {
    setText("abc");
    await runConvert(app, { target: "JSON", success: "Converted to JSON", run: (t) => ({ ok: true, text: t, warnings: ["comments were dropped", "keys were converted"] }) });
    expect(app.manager.docs).toHaveLength(2);
    expect(notify).toHaveBeenLastCalledWith("Converted to JSON. Note: comments were dropped; keys were converted", "info");
  });

  it("aborts if the source changed while an async converter ran", async () => {
    setText("abc");
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const pending = runConvert(app, { target: "YAML", success: "ok", run: async (t) => (await gate, { ok: true, text: t }) });
    app.newTab();
    release();
    const r = await pending;
    expect(r.ok).toBe(false);
    expect(app.manager.docs).toHaveLength(2);
  });
});
