import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../app/app";
import { memoryClipboard } from "../app/clipboard";
import { DocumentManager } from "../docs/documentManager";
import { createMockIpc } from "../ipc";
import { DEFAULT_SETTINGS, type Settings } from "../settings/model";
import { FunctionListPanel } from "./panel";

let app: App;
let el: HTMLElement;
let settings: Settings;
let panel: FunctionListPanel;

const setText = (t: string) => app.view.dispatch({ changes: { from: 0, to: app.view.state.doc.length, insert: t }, selection: { anchor: 0 } });
const rows = () => [...el.querySelectorAll<HTMLElement>("[data-testid='fl-item']")].map((r) => r.querySelector(".fl-name")!.textContent);

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="tabs"></div><div id="editor"></div><div id="status"></div><section id="fl"></section>';
  settings = { ...DEFAULT_SETTINGS };
  app = new App({
    editorParent: document.getElementById("editor")!,
    tabsEl: document.getElementById("tabs")!,
    statusEl: document.getElementById("status")!,
    manager: new DocumentManager(),
    platform: { pickOpenPath: vi.fn(), pickSavePath: vi.fn(), pickFolder: vi.fn(), confirmUnsaved: vi.fn(), confirm: vi.fn(), clipboard: memoryClipboard() },
    ipc: createMockIpc({}),
    settings: { get: () => settings, subscribe: () => () => {} },
  });
  app.start();
  el = document.getElementById("fl")!;
  panel = new FunctionListPanel(el, app, () => settings, 0);
});

afterEach(() => {
  panel.dispose();
  vi.useRealTimers();
});

describe("Function List panel", () => {
  it("lists the symbols of the active document with kind and line", async () => {
    app.setLanguage("JavaScript");
    await app.languageReady();
    setText("function a(){}\nclass C {}");
    panel.refreshNow();
    expect(rows()).toEqual(["a", "C"]);
    const first = el.querySelector("[data-testid='fl-item']")!;
    expect(first.querySelector(".fl-kind")!.textContent).toBe("function");
    expect(first.querySelector(".fl-line")!.textContent).toBe("1");
  });

  it("shows an empty-state message when the document has no symbols", () => {
    setText("just text");
    panel.refreshNow();
    expect(el.querySelector("[data-testid='fl-empty']")!.textContent).toMatch(/no symbols/i);
  });

  it("clicking a symbol moves the caret to its line", async () => {
    app.setLanguage("JavaScript");
    await app.languageReady();
    setText("function a(){}\n\nfunction b(){}");
    panel.refreshNow();
    el.querySelectorAll<HTMLElement>("[data-testid='fl-item']")[1].click();
    expect(app.view.state.doc.lineAt(app.getSelection().from).number).toBe(3);
  });

  it("filters by name ignoring case", async () => {
    app.setLanguage("JavaScript");
    await app.languageReady();
    setText("function parseJson(){}\nfunction renderTab(){}");
    panel.refreshNow();
    const input = el.querySelector<HTMLInputElement>("[data-testid='fl-filter']")!;
    input.value = "JSON";
    input.dispatchEvent(new Event("input"));
    expect(rows()).toEqual(["parseJson"]);
    input.value = "";
    input.dispatchEvent(new Event("input"));
    expect(rows()).toEqual(["parseJson", "renderTab"]);
  });

  it("refreshes after typing once the debounce has passed", async () => {
    app.setLanguage("JavaScript");
    await app.languageReady();
    panel.refreshNow();
    setText("function added(){}");
    await vi.advanceTimersByTimeAsync(50);
    expect(rows()).toEqual(["added"]);
  });

  it("shows the other tab's functions after switching tabs", async () => {
    app.setLanguage("JavaScript");
    await app.languageReady();
    setText("function one(){}");
    const firstId = app.manager.activeId!;
    app.newTab();
    app.setLanguage("JavaScript");
    await app.languageReady();
    setText("function two(){}");
    await vi.advanceTimersByTimeAsync(50);
    expect(rows()).toEqual(["two"]);
    app.activateTab(firstId);
    await vi.advanceTimersByTimeAsync(50);
    expect(rows()).toEqual(["one"]);
  });

  it("follows a language change", async () => {
    setText("# Title");
    panel.refreshNow();
    expect(rows()).toEqual([]);
    app.setLanguage("Markdown");
    await app.languageReady();
    await vi.advanceTimersByTimeAsync(50);
    expect(rows()).toEqual(["Title"]);
  });

  it("does not compute while the panel is hidden", () => {
    el.hidden = true;
    setText("function a(){}");
    app.setLanguage("JavaScript");
    panel.refreshNow();
    expect(rows()).toEqual([]);
  });

  it("keeps the last list when the document is above the large-file threshold", async () => {
    app.setLanguage("JavaScript");
    await app.languageReady();
    setText("function small(){}");
    panel.refreshNow();
    settings = { ...settings, largeFileThresholdBytes: 10 };
    setText("function small(){}\nfunction big(){}");
    panel.refreshNow();
    expect(rows()).toEqual(["small"]);
    expect(el.querySelector("[data-testid='fl-notice']")!.textContent).toMatch(/large/i);
  });
});
