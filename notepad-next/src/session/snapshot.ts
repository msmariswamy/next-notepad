import type { DocumentManager, Doc, ClosedDoc, LoadedFile } from "../docs/documentManager";
import type { Eol } from "../editor/status";
import type { Ipc } from "../ipc";

/** Mirrors the Rust `TabSnapshot` (camelCase JSON). */
export interface TabSnapshot {
  id: string;
  title: string;
  path: string | null;
  encoding: string;
  bom: boolean;
  eol: Eol;
  language: string;
  dirty: boolean;
  /** Present for untitled and dirty tabs; null for clean saved tabs (reloaded from disk). */
  text: string | null;
}

export interface SessionSnapshot {
  tabs: TabSnapshot[];
  activeId: string | null;
  recentlyClosed: TabSnapshot[];
}

function tabSnapshot(d: Doc): TabSnapshot {
  return {
    id: d.id,
    title: d.title,
    path: d.path,
    encoding: d.encoding,
    bom: d.bom,
    eol: d.eol,
    language: d.language,
    dirty: d.dirty,
    text: d.dirty || d.path === null ? d.text : null,
  };
}

function closedSnapshot(c: ClosedDoc, index: number): TabSnapshot {
  return {
    id: `closed-${index}`,
    title: c.title,
    path: c.path,
    encoding: c.encoding,
    bom: c.bom,
    eol: c.eol,
    language: "Normal text",
    dirty: true,
    text: c.text,
  };
}

export function buildSnapshot(mgr: DocumentManager): SessionSnapshot {
  return {
    tabs: mgr.docs.map(tabSnapshot),
    activeId: mgr.activeId,
    recentlyClosed: mgr.recentlyClosed.map(closedSnapshot),
  };
}

async function readFromDisk(ipc: Ipc, path: string): Promise<LoadedFile | null> {
  try {
    return await ipc.invoke<LoadedFile>("open_file", { path });
  } catch {
    return null;
  }
}

/**
 * Restore tabs from the stored session. Contents only: cursor, scroll and undo history are not restored.
 * Returns true when at least one tab was restored.
 */
export async function restoreSession(mgr: DocumentManager, ipc: Ipc): Promise<boolean> {
  const snap = await ipc.invoke<SessionSnapshot>("load_session");
  let restored = 0;
  for (const tab of snap.tabs) {
    const disk = tab.path ? await readFromDisk(ipc, tab.path) : null;
    let text: string;
    let savedText: string;
    if (tab.text !== null) {
      text = tab.text;
      savedText = disk ? disk.text : "";
    } else if (disk) {
      text = savedText = disk.text; // clean tab: whatever is on disk now
    } else {
      continue; // clean tab whose file vanished: nothing of the user's to restore
    }
    mgr.restoreDoc({
      id: tab.id,
      title: tab.title,
      path: tab.path,
      text,
      savedText,
      eol: tab.eol,
      encoding: tab.encoding,
      bom: tab.bom,
      language: tab.language,
      // A tab that was dirty only because of an EOL/encoding change has no text difference to show.
      metaDirty: tab.dirty && text === savedText,
      missing: tab.path !== null && disk === null,
    });
    restored++;
  }
  mgr.recentlyClosed = snap.recentlyClosed
    .filter((t) => t.text !== null)
    .map((t) => ({
      title: t.title,
      path: t.path,
      text: t.text as string,
      eol: t.eol,
      encoding: t.encoding,
      bom: t.bom,
      closedAt: 0,
    }));
  if (snap.activeId) mgr.activate(snap.activeId);
  return restored > 0;
}
