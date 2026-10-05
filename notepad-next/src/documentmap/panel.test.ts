import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../app/app";
import { memoryClipboard } from "../app/clipboard";
import { DocumentManager } from "../docs/documentManager";
import { createMockIpc } from "../ipc";
import { DEFAULT_SETTINGS, type Settings } from "../settings/model";
import { DocumentMapPanel } from "./panel";

let app: App;
let el: HTMLElement;
let settings: Settings;
let panel: DocumentMapPanel;
let metrics: { scrollTop: number; clientHeight: number; scrollHeight: number };

const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i}`).join("\n");
const setText = (t: string) => app.view.dispatch({ changes: { from: 0, to: app.view.state.doc.length, insert: t }, selection: { anchor: 0 } });
const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid='${id}']`)!;
const pointer = (type: string, clientY: number) => q("dm-body").dispatchEvent(new MouseEvent(type, { clientY, bubbles: true }));

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="tabs"></div><div id="editor"></div><div id="status"></div><section id="dm"></section>';
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
  metrics = { scrollTop: 0, clientHeight: 500, scrollHeight: 2000 };
  const sd = app.view.scrollDOM;
  Object.defineProperty(sd, "scrollTop", { get: () => metrics.scrollTop, set: (v: number) => void (metrics.scrollTop = v), configurable: true });
  Object.defineProperty(sd, "clientHeight", { get: () => metrics.clientHeight, configurable: true });
  Object.defineProperty(sd, "scrollHeight", { get: () => metrics.scrollHeight, configurable: true });
  el = document.getElementById("dm")!;
  panel = new DocumentMapPanel(el, app, () => settings, 0);
});

afterEach(() => {
  panel.dispose();
  vi.useRealTimers();
});

describe("Document Map panel", () => {
  it("highlights the visible part of the document", () => {
    setText(lines(100));
    panel.refreshNow();
    // 100 lines -> 200px of map; the editor shows a quarter of the document.
    expect(q("dm-viewport").style.top).toBe("0px");
    expect(q("dm-viewport").style.height).toBe("50px");
  });

  it("the highlight follows scrolling", () => {
    setText(lines(100));
    panel.refreshNow();
    metrics.scrollTop = 750;
    app.view.scrollDOM.dispatchEvent(new Event("scroll"));
    expect(q("dm-viewport").style.top).toBe("75px");
  });

  it("clicking the map scrolls the editor to that part", () => {
    setText(lines(100));
    panel.refreshNow();
    pointer("pointerdown", 100);
    pointer("pointerup", 100);
    expect(metrics.scrollTop).toBe(750);
  });

  it("dragging scrolls continuously and stops on release", () => {
    setText(lines(100));
    panel.refreshNow();
    pointer("pointerdown", 50);
    pointer("pointermove", 150);
    expect(metrics.scrollTop).toBe(1250);
    pointer("pointerup", 150);
    pointer("pointermove", 20);
    expect(metrics.scrollTop).toBe(1250);
  });

  it("redraws after an edit once the debounce has passed", async () => {
    setText(lines(100));
    panel.refreshNow();
    const before = q("dm-body").dataset.lines;
    setText(lines(200));
    await vi.advanceTimersByTimeAsync(20);
    expect(q("dm-body").dataset.lines).not.toBe(before);
    expect(q("dm-body").dataset.lines).toBe("200");
  });

  it("is switched off with a notice above 50,000 lines", () => {
    setText("x\n".repeat(50_001));
    panel.refreshNow();
    expect(q("dm-notice").hidden).toBe(false);
    expect(q("dm-notice").textContent).toMatch(/large/i);
    expect(q("dm-body").hidden).toBe(true);
  });

  it("is switched off above the large-file threshold", () => {
    settings = { ...settings, largeFileThresholdBytes: 10 };
    setText(lines(10));
    panel.refreshNow();
    expect(q("dm-notice").hidden).toBe(false);
  });

  it("draws again for a small tab after a large one", () => {
    setText("x\n".repeat(50_001));
    panel.refreshNow();
    setText(lines(10));
    panel.refreshNow();
    expect(q("dm-notice").hidden).toBe(true);
    expect(q("dm-body").hidden).toBe(false);
  });

  it("does not draw while the panel is hidden", () => {
    el.hidden = true;
    setText(lines(100));
    panel.refreshNow();
    expect(q("dm-body").dataset.lines).toBeUndefined();
  });
});
