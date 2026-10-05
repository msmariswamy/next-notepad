import type { DocumentManager } from "../docs/documentManager";

export interface TabBarHandlers {
  onActivate(id: string): void;
  onClose(id: string): void;
  onNew(): void;
  onMove(id: string, toIndex: number): void;
}

/** Render the tab strip: active highlight, modified indicator, close buttons, drag reorder. */
export function renderTabBar(el: HTMLElement, mgr: DocumentManager, h: TabBarHandlers): void {
  el.replaceChildren();
  el.setAttribute("role", "tablist");
  mgr.docs.forEach((doc, index) => {
    const tab = document.createElement("div");
    tab.className = "tab" + (doc.id === mgr.activeId ? " active" : "") + (doc.dirty ? " dirty" : "");
    tab.setAttribute("role", "tab");
    tab.dataset.id = doc.id;
    tab.draggable = true;

    const label = document.createElement("span");
    label.className = "tab-title";
    label.textContent = (doc.dirty ? "● " : "") + doc.title;
    label.title = doc.path ?? doc.title;

    const close = document.createElement("button");
    close.className = "tab-close";
    close.setAttribute("aria-label", `Close ${doc.title}`);
    close.textContent = "×";
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      h.onClose(doc.id);
    });

    tab.append(label, close);
    tab.addEventListener("click", () => h.onActivate(doc.id));
    tab.addEventListener("dragstart", (e) => e.dataTransfer?.setData("text/plain", doc.id));
    tab.addEventListener("dragover", (e) => e.preventDefault());
    tab.addEventListener("drop", (e) => {
      e.preventDefault();
      const dragged = e.dataTransfer?.getData("text/plain");
      if (dragged && dragged !== doc.id) h.onMove(dragged, index);
    });
    el.append(tab);
  });

  const add = document.createElement("button");
  add.className = "tab-new";
  add.setAttribute("aria-label", "New tab");
  add.textContent = "+";
  add.addEventListener("click", () => h.onNew());
  el.append(add);
}
