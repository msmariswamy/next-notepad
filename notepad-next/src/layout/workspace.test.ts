import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../settings/model";
import { applyDockVisibility } from "./workspace";

let dock: HTMLElement;
let functions: HTMLElement;
let map: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = `<aside id="dock" hidden><section id="panel-functions" hidden></section><section id="panel-map" hidden></section></aside>`;
  dock = document.getElementById("dock")!;
  functions = document.getElementById("panel-functions")!;
  map = document.getElementById("panel-map")!;
});

describe("applyDockVisibility", () => {
  it("hides the dock when both panels are off", () => {
    applyDockVisibility({ dock, functions, map }, DEFAULT_SETTINGS);
    expect([dock.hidden, functions.hidden, map.hidden]).toEqual([true, true, true]);
  });

  it("shows the dock and only the enabled panel", () => {
    applyDockVisibility({ dock, functions, map }, { ...DEFAULT_SETTINGS, showFunctionList: true });
    expect([dock.hidden, functions.hidden, map.hidden]).toEqual([false, false, true]);
  });

  it("shows both panels together", () => {
    applyDockVisibility({ dock, functions, map }, { ...DEFAULT_SETTINGS, showFunctionList: true, showDocumentMap: true });
    expect([dock.hidden, functions.hidden, map.hidden]).toEqual([false, false, false]);
  });

  it("hides the dock again once the last panel is turned off", () => {
    applyDockVisibility({ dock, functions, map }, { ...DEFAULT_SETTINGS, showDocumentMap: true });
    applyDockVisibility({ dock, functions, map }, DEFAULT_SETTINGS);
    expect(dock.hidden).toBe(true);
  });
});
