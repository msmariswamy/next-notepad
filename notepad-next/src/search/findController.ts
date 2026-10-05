import type { App } from "../app/app";
import type { Query, Range } from "./searchService";
import { countMatches, findAll, findNext, planReplaceAll, planReplaceCurrent } from "./searchService";
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

export interface ResultLine {
  line: number;
  text: string;
  from: number;
  to: number;
}

export interface DocResults {
  docId: string;
  title: string;
  hits: ResultLine[];
}

export interface SearchOutcome {
  /** User-visible one-line summary, e.g. 'Search "x" (3 hits in 2 files)'. */
  summary: string;
  results: DocResults[];
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  return starts;
}

function lineOf(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function hitsFor(text: string, ranges: Range[]): ResultLine[] {
  const starts = lineStarts(text);
  return ranges.map((r) => {
    const i = lineOf(starts, r.from);
    const end = i + 1 < starts.length ? starts[i + 1] - 1 : text.length;
    return { line: i + 1, text: text.slice(starts[i], end), from: r.from, to: r.to };
  });
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Find/Replace logic behind the dialog (spec: find-replace). Regex errors are thrown as
 * SyntaxError; the dialog catches them and shows an inline message without touching the editor.
 */
export class FindController {
  state: FindState = { ...DEFAULT_FIND_STATE, opts: { ...DEFAULT_PATTERN_OPTIONS } };

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
    const plan = planReplaceCurrent(this.activeText(), this.query(), this.app.getSelection());
    if (plan) {
      this.app.applyChangesToDoc(this.app.manager.activeId!, [plan.change]);
      this.app.setSelection({ from: plan.nextFrom, to: plan.nextFrom });
    }
    return this.findNext();
  }

  /** Replace every match in the current tab (one undo step); returns how many were replaced. */
  replaceAll(): number {
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
}
