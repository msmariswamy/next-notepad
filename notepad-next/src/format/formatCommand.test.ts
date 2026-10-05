import { beforeEach, describe, expect, it, vi } from "vitest";
import { undo } from "@codemirror/commands";
import { App } from "../app/app";
import { memoryClipboard } from "../app/clipboard";
import { DocumentManager } from "../docs/documentManager";
import { createMockIpc } from "../ipc";
import { runJsonCommand } from "../json/jsonCommands";
import { DEFAULT_SETTINGS } from "../settings/model";
import { runFormatDocument } from "./formatCommand";

let app: App;
let notify: ReturnType<typeof vi.fn<(m: string, k: "info" | "error") => void>>;
const opts = { tabWidth: 2, useTabs: false };

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
    detectDelayMs: 100000, // detection only when Format asks for it
  });
  app.start();
});

const set = (text: string, lang?: string) => {
  app.view.dispatch({ changes: { from: 0, to: app.view.state.doc.length, insert: text }, selection: { anchor: 0 } });
  if (lang) app.setLanguage(lang);
};
const text = () => app.view.state.doc.toString();

describe("Format Document", () => {
  it.each([
    ["JavaScript", "function f(){return 1}", "function f() {\n  return 1;\n}"],
    ["HTML", "<div><p>Hi</p></div>", "<div>\n  <p>Hi</p>\n</div>"],
    ["XML", "<a><b>1</b><c/></a>", "<a>\n  <b>1</b>\n  <c/>\n</a>"],
    ["YAML", "a:   1\nb:\n      - x", "a: 1\nb:\n  - x"],
    ["Java", "class A{void f(){int x=1;}}", "class A {\n  void f() {\n    int x=1;\n  }\n}"],
    ["CSS", "a{color:red}", "a {\n  color: red;\n}"],
    ["TypeScript", "let a:number=1", "let a: number = 1;"],
    ["JSON", '{"a":1}', '{\n  "a": 1\n}'],
  ])("formats %s", async (lang, input, expected) => {
    set(input, lang);
    expect(await runFormatDocument(app, opts)).toEqual({ ok: true, message: `Formatted as ${lang}` });
    expect(text()).toBe(expected);
  });

  it("uses the tab width and tab setting", async () => {
    set("function f(){return 1}", "JavaScript");
    await runFormatDocument(app, { tabWidth: 4, useTabs: true });
    expect(text()).toBe("function f() {\n\treturn 1;\n}");
  });

  it("detects the language first for a Normal-text tab, then formats", async () => {
    set('{"a":1}');
    expect((await runFormatDocument(app, opts)).ok).toBe(true);
    expect(app.manager.active!.language).toBe("JSON");
    expect(text()).toBe('{\n  "a": 1\n}');
  });

  it.each([
    ['<?xml version="1.0"?><root><a/></root>', "XML"],
    ["name: app\nitems:\n  - a", "YAML"],
    ["package a;\npublic class Foo {}", "Java"],
  ])("detects and formats %#", async (input, lang) => {
    set(input);
    await runFormatDocument(app, opts);
    expect(app.manager.active!.language).toBe(lang);
  });

  it("says the language could not be detected and leaves prose alone", async () => {
    set("Just some ordinary words.");
    const r = await runFormatDocument(app, opts);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/could not detect the language/i);
    expect(text()).toBe("Just some ordinary words.");
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/could not detect/i), "error");
  });

  it("reports a syntax error, leaves the text unchanged and moves the caret to it", async () => {
    set("let a = 1;\nfunction (", "JavaScript");
    const r = await runFormatDocument(app, opts);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/^Cannot format JavaScript: Line 2/);
    expect(text()).toBe("let a = 1;\nfunction (");
    expect(app.view.state.doc.lineAt(app.getSelection().from).number).toBe(2);
  });

  it("refuses a language without a formatter", async () => {
    set("fn main(){}", "Rust");
    const r = await runFormatDocument(app, opts);
    expect(r).toEqual({ ok: false, message: "No formatter for Rust" });
    expect(text()).toBe("fn main(){}");
  });

  it("is one undo step", async () => {
    set("function f(){return 1}", "JavaScript");
    await runFormatDocument(app, opts);
    undo(app.view);
    expect(text()).toBe("function f(){return 1}");
  });

  it("formats only the selection when there is one", async () => {
    set("a{color:red}\nb{color:blue}", "CSS");
    app.setSelection({ from: 0, to: 13 });
    await runFormatDocument(app, opts);
    expect(text()).toBe("a {\n  color: red;\n}\nb{color:blue}");
  });

  it("does not mark the tab modified when the code is already formatted", async () => {
    set("a {\n  color: red;\n}", "CSS");
    app.manager.markSaved(app.manager.activeId!);
    await runFormatDocument(app, opts);
    expect(app.manager.active!.dirty).toBe(false);
  });

  it("ignores the result if the document changed while an async formatter was loading", async () => {
    set("a{color:red}", "CSS");
    const pending = runFormatDocument(app, opts);
    app.view.dispatch({ changes: { from: 0, insert: "/* edited */ " } });
    const r = await pending;
    expect(r.ok).toBe(false);
    expect(text()).toBe("/* edited */ a{color:red}");
  });
});

describe("JSON menu extras", () => {
  it("pretty-print with 4 spaces and with tabs", () => {
    set('{"a":1}');
    runJsonCommand(app, "pretty4");
    expect(text()).toBe('{\n    "a": 1\n}');
    set('{"a":1}');
    runJsonCommand(app, "prettyTabs");
    expect(text()).toBe('{\n\t"a": 1\n}');
  });

  it("compress puts everything on one line", () => {
    set('{\n  "a": [1, 2]\n}');
    runJsonCommand(app, "minify");
    expect(text()).toBe('{"a":[1,2]}');
  });

  it("sort keys", () => {
    set('{"b":1,"a":{"d":1,"c":2}}');
    runJsonCommand(app, "sortKeys");
    expect(text()).toBe('{\n  "a": {\n    "c": 2,\n    "d": 1\n  },\n  "b": 1\n}');
  });

  it("escape and unescape a selection as a JSON string", () => {
    set('say "hi"\n');
    app.setSelection({ from: 0, to: app.view.state.doc.length });
    runJsonCommand(app, "escape");
    expect(text()).toBe('"say \\"hi\\"\\n"');
    app.setSelection({ from: 0, to: app.view.state.doc.length });
    runJsonCommand(app, "unescape");
    expect(text()).toBe('say "hi"\n');
  });

  it("unescape reports text that is not a JSON string and changes nothing", () => {
    set("plain \\x text");
    const r = runJsonCommand(app, "unescape");
    expect(r).toEqual({ ok: false, message: "Not a valid JSON string" });
    expect(text()).toBe("plain \\x text");
  });

  it("valid JSON in a plain-text tab switches the language to JSON", () => {
    set('{"a":1}');
    expect(app.manager.active!.language).toBe("Normal text");
    runJsonCommand(app, "pretty");
    expect(app.manager.active!.language).toBe("JSON");
  });

  it("invalid JSON does not change the language", () => {
    set('{"a":');
    runJsonCommand(app, "pretty");
    expect(app.manager.active!.language).toBe("Normal text");
  });

  it("does not switch the language when the user chose another one", () => {
    set('{"a":1}', "Python");
    runJsonCommand(app, "pretty");
    expect(app.manager.active!.language).toBe("Python");
  });
});
