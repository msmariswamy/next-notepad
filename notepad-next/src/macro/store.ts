import type { Ipc } from "../ipc";
import { emptyMacroFile, parseMacroFile, type Macro, type MacroFile } from "./model";

/**
 * The saved-macro list (spec: macro-recording). The Rust backend owns the file (ADR-0002); this keeps the
 * list in memory, changes it, and writes the whole file back. A failed write leaves the list as it was.
 */
export class MacroStore {
  private file: MacroFile = emptyMacroFile();
  /** True when the file on disk is from a newer version: we show nothing and never overwrite it. */
  private locked = false;
  private listeners = new Set<() => void>();

  constructor(private ipc: Ipc) {}

  async load(): Promise<void> {
    try {
      this.file = parseMacroFile(await this.ipc.invoke("load_macros"));
      this.locked = false;
    } catch (e) {
      // An unreadable or newer-version file: start with no macros, and do not overwrite it if it is from the future.
      this.file = emptyMacroFile();
      this.locked = e instanceof Error && /version/i.test(e.message);
    }
    this.emit();
  }

  list(): Macro[] {
    return this.file.macros;
  }

  get(name: string): Macro | undefined {
    return this.file.macros.find((m) => m.name === name);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Add a macro, or replace the one with the same name. */
  async save(macro: Macro): Promise<void> {
    const name = macro.name.trim();
    if (name === "") throw new Error("A macro needs a name");
    const next: Macro = { ...macro, name };
    const exists = this.file.macros.some((m) => m.name === name);
    await this.commit(exists ? this.file.macros.map((m) => (m.name === name ? next : m)) : [...this.file.macros, next]);
  }

  async rename(from: string, to: string): Promise<void> {
    const name = to.trim();
    if (name === "") throw new Error("A macro needs a name");
    if (!this.get(from)) throw new Error(`Macro not found: ${from}`);
    if (name !== from && this.get(name)) throw new Error(`A macro named "${name}" already exists`);
    await this.commit(this.file.macros.map((m) => (m.name === from ? { ...m, name } : m)));
  }

  async remove(name: string): Promise<void> {
    await this.commit(this.file.macros.filter((m) => m.name !== name));
  }

  private async commit(macros: Macro[]): Promise<void> {
    if (this.locked) throw new Error("The macro file was written by a newer version of next-notepad and was left unchanged");
    const next: MacroFile = { version: this.file.version, macros };
    await this.ipc.invoke("save_macros", { file: next });
    this.file = next;
    this.emit();
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
