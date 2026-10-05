import type { EditorView } from "@codemirror/view";
import type { App } from "../app/app";
import { addBookmarks, clearBookmarks, getBookmarkLines } from "../editor/marks";

/** Bookmarked-line operations (spec: bookmark-lines). Each edit is one undo step. */
export class BookmarkOps {
  constructor(private app: App) {}

  private get view(): EditorView {
    return this.app.view;
  }

  private lines(): number[] {
    return getBookmarkLines(this.view.state);
  }

  private none(): boolean {
    if (this.lines().length > 0) return false;
    this.app.notify("No bookmarked lines", "error");
    return true;
  }

  private text(): string {
    const doc = this.view.state.doc;
    return this.lines().map((n) => doc.line(n).text).join("\n");
  }

  async copy(): Promise<boolean> {
    if (this.none()) return false;
    await this.app.clipboard.writeText(this.text());
    return true;
  }

  async cut(): Promise<boolean> {
    if (!(await this.copy())) return false;
    return this.removeBookmarked();
  }

  /** Delete whole lines (including their line break), keeping the marks on the lines that stay. */
  private deleteLines(numbers: number[]): boolean {
    if (numbers.length === 0) return false;
    const doc = this.view.state.doc;
    const drop = new Set(numbers);
    const changes: { from: number; to: number; insert: string }[] = [];
    for (let n = 1; n <= doc.lines; ) {
      if (!drop.has(n)) {
        n++;
        continue;
      }
      let end = n;
      while (drop.has(end + 1)) end++;
      const first = doc.line(n);
      const last = doc.line(end);
      // A run at the end of the document takes the break before it instead of the one after it.
      const atEnd = end === doc.lines;
      changes.push(atEnd && n > 1 ? { from: first.from - 1, to: last.to, insert: "" } : { from: first.from, to: Math.min(last.to + 1, doc.length), insert: "" });
      n = end + 1;
    }
    this.app.applyChangesToDoc(this.app.manager.activeId!, changes);
    return true;
  }

  removeBookmarked(): boolean {
    if (this.none()) return false;
    const removed = this.deleteLines(this.lines());
    // Every bookmarked line is gone; a marker at a deleted line's edge could otherwise stick to a neighbour.
    clearBookmarks(this.view);
    return removed;
  }

  removeNonBookmarked(): boolean {
    if (this.none()) return false;
    const keep = new Set(this.lines());
    const all = Array.from({ length: this.view.state.doc.lines }, (_, i) => i + 1);
    const removed = this.deleteLines(all.filter((n) => !keep.has(n)));
    if (removed) {
      // Every surviving line was bookmarked, so after the deletion lines 1..k are the bookmarked ones.
      // Re-add them explicitly: a marker sitting right after a deleted range is not guaranteed to survive mapping.
      const doc = this.view.state.doc;
      clearBookmarks(this.view);
      addBookmarks(this.view, Array.from({ length: Math.min(keep.size, doc.lines) }, (_, i) => doc.line(i + 1).from));
    }
    return removed;
  }

  /** Replace the text of every bookmarked line with the clipboard text. */
  async pasteReplace(): Promise<boolean> {
    if (this.none()) return false;
    const text = (await this.app.clipboard.readText()).replace(/\r\n|\r/g, "\n").replace(/\n$/, "");
    const doc = this.view.state.doc;
    const changes = this.lines().map((n) => ({ from: doc.line(n).from, to: doc.line(n).to, insert: text }));
    this.app.applyChangesToDoc(this.app.manager.activeId!, changes);
    return true;
  }

  inverse(): void {
    const doc = this.view.state.doc;
    const marked = new Set(this.lines());
    const flipped: number[] = [];
    for (let n = 1; n <= doc.lines; n++) if (!marked.has(n)) flipped.push(doc.line(n).from);
    clearBookmarks(this.view);
    addBookmarks(this.view, flipped);
  }
}
