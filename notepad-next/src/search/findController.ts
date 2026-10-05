import type { App } from "../app/app";
import { hitsFor, type ResultLine } from "./resultLines";
import type { Query, Range } from "./searchService";
import { countMatches, findAll, findNext, planReplaceAll, planReplaceCurrent } from "./searchService";
import { addBookmarks, addMarks, clearBookmarks, clearMarks, neighbourBookmark, toggleBookmark } from "../editor/marks";
import { DEFAULT_PATTERN_OPTIONS, type PatternOptions } from "./regexCompat";

export interface FindState {
  pattern: string;
  replacement: string;
  opts: PatternOptions;
  backward: boolean;
  wrap: boolean;
  inSelection: boolean;
}

export const DEFAULT_FIND_STATE: FindState = {
  pattern: "",
  replacement: "",
  opts: { ...DEFAULT_PATTERN_OPTIONS },
  backward: false,
  wrap: false,
  inSelection: false,
};

export interface DocResults {
  docId: string;
  title: string;
  /** Set for results from Find in Files / Projects. */
  path?: string;
  hits: ResultLine[];
}

export interface SearchOutcome {
  /** User-visible one-line summary, e.g. 'Search "x" (3 hits in 2 files)'. */
  summary: string;
  results: DocResults[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Find/Replace logic behind the dialog (spec: find-replace). Regex errors are thrown as
 * SyntaxError; the dialog catches them and shows an inline message without touching the editor.
 */
export class FindController {
  state: FindState = { ...DEFAULT_FIND_STATE, opts: { ...DEFAULT_PATTERN_OPTIONS } };

  /** Told about each Find Next, Replace and Replace All with the settings it used (the macro recorder listens here). */
  onAction?: (action: "findNext" | "replace" | "replaceAll", state: FindState) => void;

  constructor(private app: App) {}

  private query(): Query {
    return { pattern: this.state.pattern, replacement: this.state.replacement, opts: this.state.opts };
  }

  /** The "In selection" range, or undefined when the option is off or nothing is selected. */
  private range(): Range | undefined {
    const sel = this.app.getSelection();
    return this.state.inSelection && sel.from !== sel.to ? sel : undefined;
  }

  private activeText(): string {
    return this.app.view.state.doc.toString();
  }

  /** Select the next match; returns false when there is none. */
  findNext(direction?: { backward: boolean }): boolean {
    this.onAction?.("findNext", { ...this.state, backward: direction?.backward ?? this.state.backward });
    return this.findNextCore(direction);
  }

  private findNextCore(direction?: { backward: boolean }): boolean {
    const hit = findNext(this.activeText(), this.query(), this.app.getSelection(), {
      backward: direction?.backward ?? this.state.backward,
      wrap: this.state.wrap,
      range: this.range(),
    });
    if (hit) this.app.setSelection(hit);
    return hit !== null;
  }

  count(): number {
    return countMatches(this.activeText(), this.query(), this.range());
  }

  findAllInCurrent(): SearchOutcome {
    const doc = this.app.manager.active;
    const text = this.activeText();
    const ranges = findAll(text, this.query(), this.range());
    return this.outcome(doc ? [{ id: doc.id, title: doc.title, text, ranges }] : []);
  }

  findAllInOpened(): SearchOutcome {
    const shown = this.app.manager.activeId;
    return this.outcome(
      this.app.manager.docs.map((d) => {
        const text = d.id === shown ? this.activeText() : d.text;
        return { id: d.id, title: d.title, text, ranges: findAll(text, this.query()) };
      }),
    );
  }

  private outcome(docs: { id: string; title: string; text: string; ranges: Range[] }[]): SearchOutcome {
    const results = docs
      .filter((d) => d.ranges.length > 0)
      .map((d) => ({ docId: d.id, title: d.title, hits: hitsFor(d.text, d.ranges) }));
    const total = results.reduce((n, r) => n + r.hits.length, 0);
    return {
      summary: `Search "${this.state.pattern}" (${plural(total, "hit")} in ${plural(results.length, "file")})`,
      results,
    };
  }

  /** Replace the selected match if there is one, then move to the next match. */
  replace(): boolean {
    this.onAction?.("replace", this.state);
    const plan = planReplaceCurrent(this.activeText(), this.query(), this.app.getSelection());
    if (plan) {
      this.app.applyChangesToDoc(this.app.manager.activeId!, [plan.change]);
      this.app.setSelection({ from: plan.nextFrom, to: plan.nextFrom });
    }
    // The follow-up search is part of Replace, not a separate action to record.
    return this.findNextCore();
  }

  /** Replace every match in the current tab (one undo step); returns how many were replaced. */
  replaceAll(): number {
    this.onAction?.("replaceAll", this.state);
    const changes = planReplaceAll(this.activeText(), this.query(), this.range());
    this.app.applyChangesToDoc(this.app.manager.activeId!, changes);
    return changes.length;
  }

  replaceAllInOpened(): { replacements: number; files: number } {
    let replacements = 0;
    let files = 0;
    for (const d of [...this.app.manager.docs]) {
      const text = d.id === this.app.manager.activeId ? this.activeText() : d.text;
      const changes = planReplaceAll(text, this.query());
      if (changes.length === 0) continue;
      this.app.applyChangesToDoc(d.id, changes);
      replacements += changes.length;
      files++;
    }
    return { replacements, files };
  }

  // ---- Mark tab (spec: mark)

  /**
   * Mark every match in the current tab with the chosen style. `purge` clears that style first;
   * `bookmarkLine` also bookmarks each matching line. Returns the number of matches marked.
   */
  markAll(o: { style: number; bookmarkLine: boolean; purge: boolean }): number {
    const ranges = findAll(this.activeText(), this.query(), this.range());
    addMarks(this.app.view, o.style, ranges, o.purge);
    if (o.bookmarkLine) addBookmarks(this.app.view, ranges.map((r) => r.from));
    return ranges.length;
  }

  clearMarks(style?: number): void {
    clearMarks(this.app.view, style);
  }

  clearBookmarks(): void {
    clearBookmarks(this.app.view);
  }

  toggleBookmarkAtCaret(): void {
    toggleBookmark(this.app.view, this.app.getSelection().from);
  }

  /** Move the caret to the next/previous bookmarked line; false when there are no bookmarks. */
  gotoBookmark(backward: boolean): boolean {
    const target = neighbourBookmark(this.app.view.state, this.app.getSelection().from, backward);
    if (target === null) return false;
    this.app.setSelection({ from: target, to: target });
    return true;
  }
}
