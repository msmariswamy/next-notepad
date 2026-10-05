import type { Settings } from "../settings/model";

export interface Dock {
  dock: HTMLElement;
  functions: HTMLElement;
  map: HTMLElement;
}

/** Look up the dock elements declared in index.html (design D5: one right dock, two panels). */
export function getDock(doc: Document = document): Dock {
  const el = (id: string) => doc.getElementById(id)!;
  return { dock: el("dock"), functions: el("panel-functions"), map: el("panel-map") };
}

/** Show each panel per its setting; the dock itself only takes space while at least one panel is visible. */
export function applyDockVisibility(d: Dock, s: Pick<Settings, "showFunctionList" | "showDocumentMap">): void {
  d.functions.hidden = !s.showFunctionList;
  d.map.hidden = !s.showDocumentMap;
  d.dock.hidden = d.functions.hidden && d.map.hidden;
}
