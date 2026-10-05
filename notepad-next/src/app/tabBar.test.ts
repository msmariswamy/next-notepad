import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentManager } from "../docs/documentManager";
import { renderTabBar, type TabBarHandlers } from "./tabBar";

let el: HTMLElement;
let mgr: DocumentManager;
let h: TabBarHandlers;

beforeEach(() => {
  el = document.createElement("div");
  mgr = new DocumentManager();
  h = { onActivate: vi.fn(), onClose: vi.fn(), onNew: vi.fn(), onMove: vi.fn() };
});

describe("tab bar", () => {
  it("renders one tab per document with its title", () => {
    mgr.newDoc();
    mgr.newDoc();
    renderTabBar(el, mgr, h);
    const titles = [...el.querySelectorAll(".tab-title")].map((t) => t.textContent);
    expect(titles).toEqual(["new 1", "new 2"]);
  });

  it("highlights the active tab only", () => {
    const a = mgr.newDoc();
    mgr.newDoc();
    mgr.activate(a.id);
    renderTabBar(el, mgr, h);
    const active = el.querySelectorAll(".tab.active");
    expect(active.length).toBe(1);
    expect((active[0] as HTMLElement).dataset.id).toBe(a.id);
  });

  it("shows the modified indicator on dirty tabs and clears it after save", () => {
    const d = mgr.newDoc();
    mgr.setText(d.id, "x");
    renderTabBar(el, mgr, h);
    expect(el.querySelector(".tab.dirty")).not.toBeNull();
    mgr.markSaved(d.id);
    renderTabBar(el, mgr, h);
    expect(el.querySelector(".tab.dirty")).toBeNull();
  });

  it("routes clicks to activate, close and new handlers", () => {
    const d = mgr.newDoc();
    renderTabBar(el, mgr, h);
    (el.querySelector(".tab") as HTMLElement).click();
    expect(h.onActivate).toHaveBeenCalledWith(d.id);
    (el.querySelector(".tab-close") as HTMLElement).click();
    expect(h.onClose).toHaveBeenCalledWith(d.id);
    expect(h.onActivate).toHaveBeenCalledTimes(1); // close click must not also activate
    (el.querySelector(".tab-new") as HTMLElement).click();
    expect(h.onNew).toHaveBeenCalled();
  });
});
