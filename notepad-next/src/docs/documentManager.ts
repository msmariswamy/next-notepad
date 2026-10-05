import type { Eol } from "../editor/status";

export interface Doc {
  id: string;
  title: string;
  /** null for untitled documents. */
  path: string | null;
  text: string;
  /** Text as of the last save (or open); dirty is derived from it. */
  savedText: string;
  dirty: boolean;
  eol: Eol;
  encoding: string;
  bom: boolean;
  language: string;
  /** Set when eol/encoding changed since the last save, which also makes the doc dirty. */
  metaDirty: boolean;
  /** True when a restored tab's file no longer exists on disk. */
  missing: boolean;
}

export interface RestoredDoc {
  id: string;
  title: string;
  path: string | null;
  text: string;
  savedText: string;
  eol: Eol;
  encoding: string;
  bom: boolean;
  language: string;
  metaDirty: boolean;
  missing: boolean;
}

export interface LoadedFile {
  text: string;
  encoding: string;
  bom: boolean;
  eol: Eol;
}

export interface ClosedDoc {
  title: string;
  path: string | null;
  text: string;
  eol: Eol;
  encoding: string;
  bom: boolean;
  closedAt: number;
}

export type CloseDecision = "close" | "prompt" | "closed";

const UNTITLED = /^new (\d+)$/;

export function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** Tab state: documents, active tab, dirty tracking and close policy (specs: tabs). */
export class DocumentManager {
  docs: Doc[] = [];
  activeId: string | null = null;
  recentlyClosed: ClosedDoc[] = [];

  private nextId = 1;
  private listeners = new Set<() => void>();
  private recentlyClosedLimit: number;

  constructor(opts: { recentlyClosedLimit?: number } = {}) {
    this.recentlyClosedLimit = opts.recentlyClosedLimit ?? 20;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  get(id: string): Doc | undefined {
    return this.docs.find((d) => d.id === id);
  }

  get active(): Doc | null {
    return this.activeId ? (this.get(this.activeId) ?? null) : null;
  }

  private nextUntitledNumber(): number {
    const highest = this.docs.reduce((max, d) => {
      const m = d.path === null ? UNTITLED.exec(d.title) : null;
      return m ? Math.max(max, Number(m[1])) : max;
    }, 0);
    return highest + 1;
  }

  private add(doc: Doc): Doc {
    this.docs.push(doc);
    this.activeId = doc.id;
    this.emit();
    return doc;
  }

  private blank(id: string, title: string): Doc {
    return {
      id,
      title,
      path: null,
      text: "",
      savedText: "",
      dirty: false,
      eol: "lf",
      encoding: "UTF-8",
      bom: false,
      language: "Normal text",
      metaDirty: false,
      missing: false,
    };
  }

  newDoc(): Doc {
    return this.add(this.blank(`doc-${this.nextId++}`, `new ${this.nextUntitledNumber()}`));
  }

  openFile(path: string, file: LoadedFile): Doc {
    const existing = this.docs.find((d) => d.path === path);
    if (existing) {
      this.activate(existing.id);
      return existing;
    }
    const doc = this.blank(`doc-${this.nextId++}`, basename(path));
    Object.assign(doc, { path, text: file.text, savedText: file.text, eol: file.eol, encoding: file.encoding, bom: file.bom });
    return this.add(doc);
  }

  /** Re-create a tab from a saved session, keeping its id so the active tab can be matched. */
  restoreDoc(data: RestoredDoc): Doc {
    const doc: Doc = { ...data, dirty: false };
    this.refreshDirty(doc);
    const n = /^doc-(\d+)$/.exec(data.id);
    if (n) this.nextId = Math.max(this.nextId, Number(n[1]) + 1);
    this.docs.push(doc);
    if (!this.activeId) this.activeId = doc.id;
    this.emit();
    return doc;
  }

  activate(id: string): void {
    if (!this.get(id) || this.activeId === id) return;
    this.activeId = id;
    this.emit();
  }

  move(id: string, toIndex: number): void {
    const from = this.docs.findIndex((d) => d.id === id);
    if (from < 0) return;
    const [doc] = this.docs.splice(from, 1);
    this.docs.splice(Math.max(0, Math.min(toIndex, this.docs.length)), 0, doc);
    this.emit();
  }

  /** Remove a tab without any policy; callers decide about prompts via requestClose. */
  close(id: string): void {
    const index = this.docs.findIndex((d) => d.id === id);
    if (index < 0) return;
    this.docs.splice(index, 1);
    if (this.activeId === id) {
      // Prefer the tab that slid into the closed tab's place, else the one before it.
      this.activeId = (this.docs[index] ?? this.docs[index - 1])?.id ?? null;
    }
    this.emit();
  }

  private refreshDirty(doc: Doc): void {
    doc.dirty = doc.text !== doc.savedText || doc.metaDirty;
  }

  setText(id: string, text: string): void {
    const doc = this.get(id);
    if (!doc || doc.text === text) return;
    doc.text = text;
    this.refreshDirty(doc);
    this.emit();
  }

  setEol(id: string, eol: Eol): void {
    const doc = this.get(id);
    if (!doc || doc.eol === eol) return;
    doc.eol = eol;
    doc.metaDirty = true;
    this.refreshDirty(doc);
    this.emit();
  }

  setEncoding(id: string, encoding: string, bom = false): void {
    const doc = this.get(id);
    if (!doc || (doc.encoding === encoding && doc.bom === bom)) return;
    Object.assign(doc, { encoding, bom, metaDirty: true });
    this.refreshDirty(doc);
    this.emit();
  }

  setLanguage(id: string, language: string): void {
    const doc = this.get(id);
    if (!doc || doc.language === language) return;
    doc.language = language;
    this.emit();
  }

  markSaved(id: string, path?: string): void {
    const doc = this.get(id);
    if (!doc) return;
    if (path) {
      doc.path = path;
      doc.title = basename(path);
    }
    doc.savedText = doc.text;
    doc.metaDirty = false;
    this.refreshDirty(doc);
    this.emit();
  }

  /**
   * Decide what closing a tab means under the silentClose setting:
   * clean tabs close; dirty tabs prompt unless silentClose is on, in which
   * case they close and their text is kept in the bounded recently-closed list.
   */
  requestClose(id: string, opts: { silentClose: boolean }): CloseDecision {
    const doc = this.get(id);
    if (!doc) return "close";
    if (!doc.dirty) {
      this.close(id);
      return "close";
    }
    if (!opts.silentClose) return "prompt";
    this.recentlyClosed.unshift({
      title: doc.title,
      path: doc.path,
      text: doc.text,
      eol: doc.eol,
      encoding: doc.encoding,
      bom: doc.bom,
      closedAt: Date.now(),
    });
    this.recentlyClosed.length = Math.min(this.recentlyClosed.length, this.recentlyClosedLimit);
    this.close(id);
    return "closed";
  }
}
