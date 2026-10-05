import { beforeEach, describe, expect, it, vi } from "vitest";
import { undo } from "@codemirror/commands";
import { EditorSelection } from "@codemirror/state";
import { App } from "../app/app";
import { memoryClipboard } from "../app/clipboard";
import { DocumentManager } from "../docs/documentManager";
import { createMockIpc } from "../ipc";
import { DEFAULT_SETTINGS } from "../settings/model";
import { runBase64Command } from "./base64Commands";

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

describe("Base64 commands", () => {
  it("encodes the selection", () => {
    setText("a Hello b");
    app.setSelection({ from: 2, to: 7 });
    expect(runBase64Command(app, "encode")).toEqual({ ok: true, message: "Base64 encoded" });
    expect(text()).toBe("a SGVsbG8= b");
  });

  it("decodes the selection", () => {
    setText("SGVsbG8=");
    app.setSelection({ from: 0, to: 8 });
    runBase64Command(app, "decode");
    expect(text()).toBe("Hello");
  });

  it("acts on the whole document when nothing is selected", () => {
    setText("Hello");
    runBase64Command(app, "encode");
    expect(text()).toBe("SGVsbG8=");
  });

  it("encodes each range of a multi-selection separately", () => {
    setText("a b");
    app.view.dispatch({ selection: EditorSelection.create([EditorSelection.range(0, 1), EditorSelection.range(2, 3)]) });
    runBase64Command(app, "encode");
    expect(text()).toBe("YQ== Yg==");
  });

  it("uses the URL-safe alphabet for the URL commands", () => {
    setText("ÿþ?>");
    runBase64Command(app, "encodeUrl");
    expect(text()).not.toMatch(/[+/]/);
    runBase64Command(app, "decodeUrl");
    expect(text()).toBe("ÿþ?>");
  });

  it("leaves invalid input untouched and says why", () => {
    setText("not base64!");
    const r = runBase64Command(app, "decode");
    expect(r.ok).toBe(false);
    expect(text()).toBe("not base64!");
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/not valid base64/i), "error");
  });

  it("changes nothing when one range of several is invalid", () => {
    setText("SGVsbG8= bad!");
    app.view.dispatch({ selection: EditorSelection.create([EditorSelection.range(0, 8), EditorSelection.range(9, 13)]) });
    runBase64Command(app, "decode");
    expect(text()).toBe("SGVsbG8= bad!");
  });

  it("is one undo step across several ranges", () => {
    setText("a b");
    app.view.dispatch({ selection: EditorSelection.create([EditorSelection.range(0, 1), EditorSelection.range(2, 3)]) });
    runBase64Command(app, "encode");
    undo(app.view);
    expect(text()).toBe("a b");
  });
});
