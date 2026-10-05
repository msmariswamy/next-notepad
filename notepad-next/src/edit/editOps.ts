import { copyLineDown, indentLess, indentMore, moveLineDown, moveLineUp, toggleBlockComment, toggleLineComment } from "@codemirror/commands";
import { EditorSelection } from "@codemirror/state";
import type { App } from "../app/app";
import {
  convertCase,
  eolToSpace,
  joinLines,
  randomizeLines,
  removeConsecutiveDuplicateLines,
  removeDuplicateLines,
  removeEmptyLines,
  reverseLines,
  sortLines,
  spaceToTabAll,
  spaceToTabLeading,
  splitLines,
  tabToSpace,
  trimBoth,
  trimBothAndEol,
  trimLeading,
  trimTrailing,
  type CaseMode,
  type SortKind,
} from "./transforms";

interface Target {
  from: number;
  to: number;
}

/** Edit-menu operations on the active tab (specs: text-transforms). Every operation is one undo step. */
export class EditOps {
  constructor(
    private app: App,
    private tabWidth: () => number,
  ) {}

  private get view() {
    return this.app.view;
  }

  private apply(targets: Target[], inserts: string[], reselect: boolean): boolean {
    const doc = this.view.state.doc;
    const changes = targets
      .map((t, i) => ({ from: t.from, to: t.to, insert: inserts[i] }))
      .filter((c) => doc.sliceString(c.from, c.to) !== c.insert);
    if (changes.length === 0) return false;
    this.app.applyChangesToDoc(this.app.manager.activeId!, changes);
    if (reselect) {
      // Keep the transformed text selected, shifting each range by the length changes before it.
      let delta = 0;
      const ranges = targets.map((t, i) => {
        const from = t.from + delta;
        delta += inserts[i].length - (t.to - t.from);
        return EditorSelection.range(from, from + inserts[i].length);
      });
      this.view.dispatch({ selection: EditorSelection.create(ranges) });
    }
    return true;
  }

  // ---- text-level (selection, or the word / whole document when nothing is selected)

  private onText(fn: (text: string) => string, empty: "word" | "doc"): boolean {
    const st = this.view.state;
    let targets: Target[] = st.selection.ranges.filter((r) => !r.empty).map((r) => ({ from: r.from, to: r.to }));
    const hadSelection = targets.length > 0;
    if (!hadSelection) {
      if (empty === "word") {
        const w = st.wordAt(st.selection.main.head);
        if (!w) return false;
        targets = [{ from: w.from, to: w.to }];
      } else targets = [{ from: 0, to: st.doc.length }];
    }
    return this.apply(targets, targets.map((t) => fn(st.sliceDoc(t.from, t.to))), hadSelection);
  }

  convertCase(mode: CaseMode): boolean {
    return this.onText((t) => convertCase(t, mode), "word");
  }

  trimTrailing = () => this.onText(trimTrailing, "doc");
  trimLeading = () => this.onText(trimLeading, "doc");
  trimBoth = () => this.onText(trimBoth, "doc");
  eolToSpace = () => this.onText(eolToSpace, "doc");
  trimBothAndEol = () => this.onText(trimBothAndEol, "doc");
  tabToSpace = () => this.onText((t) => tabToSpace(t, this.tabWidth()), "doc");
  spaceToTabAll = () => this.onText((t) => spaceToTabAll(t, this.tabWidth()), "doc");
  spaceToTabLeading = () => this.onText((t) => spaceToTabLeading(t, this.tabWidth()), "doc");

  // ---- line-level

  /** The full lines touched by the selection; the whole document or the caret's line when nothing is selected. */
  private lineTarget(scope: "doc" | "line"): { target: Target; selected: boolean } {
    const st = this.view.state;
    const sel = st.selection.main;
    if (!sel.empty) {
      const from = st.doc.lineAt(sel.from).from;
      // A selection that ends at the very start of a line does not include that line.
      const endPos = sel.to > sel.from && sel.to === st.doc.lineAt(sel.to).from ? sel.to - 1 : sel.to;
      return { target: { from, to: st.doc.lineAt(endPos).to }, selected: true };
    }
    if (scope === "doc") return { target: { from: 0, to: st.doc.length }, selected: false };
    const line = st.doc.lineAt(sel.head);
    return { target: { from: line.from, to: line.to }, selected: false };
  }

  private onLines(fn: (lines: string[]) => string[], scope: "doc" | "line"): boolean {
    const { target, selected } = this.lineTarget(scope);
    const lines = this.view.state.sliceDoc(target.from, target.to).split("\n");
    return this.apply([target], [fn(lines).join("\n")], selected);
  }

  duplicateLine(): boolean {
    return copyLineDown(this.view);
  }
  moveLineUp(): boolean {
    return moveLineUp(this.view);
  }
  moveLineDown(): boolean {
    return moveLineDown(this.view);
  }

  removeDuplicateLines = () => this.onLines(removeDuplicateLines, "doc");
  removeConsecutiveDuplicateLines = () => this.onLines(removeConsecutiveDuplicateLines, "doc");
  reverseLines = () => this.onLines(reverseLines, "doc");
  randomizeLines = () => this.onLines((l) => randomizeLines(l), "doc");
  removeEmptyLines = () => this.onLines((l) => removeEmptyLines(l, false), "doc");
  removeEmptyLinesWithBlanks = () => this.onLines((l) => removeEmptyLines(l, true), "doc");
  splitLines = (width = 80) => this.onLines((l) => splitLines(l, width), "doc");

  /** Join the selected lines; with nothing selected, join the caret's line with the next one. */
  joinLines(): boolean {
    const st = this.view.state;
    if (!st.selection.main.empty) return this.onLines(joinLines, "line");
    const line = st.doc.lineAt(st.selection.main.head);
    if (line.number >= st.doc.lines) return false;
    const next = st.doc.line(line.number + 1);
    return this.apply([{ from: line.from, to: next.to }], [joinLines([line.text, next.text])[0]], false);
  }

  sort(kind: SortKind, dir: "asc" | "desc"): boolean {
    return this.onLines((l) => sortLines(l, kind, dir), "doc");
  }

  insertBlankLine(where: "above" | "below"): boolean {
    const st = this.view.state;
    const line = st.doc.lineAt(st.selection.main.head);
    // Insert just a line break, so the caret and any marks keep following their text.
    const pos = where === "above" ? line.from : line.to;
    this.app.applyChangesToDoc(this.app.manager.activeId!, [{ from: pos, to: pos, insert: "\n" }]);
    return true;
  }

  // ---- indent / comment

  indent = () => indentMore(this.view);
  outdent = () => indentLess(this.view);
  toggleLineComment = () => toggleLineComment(this.view);
  toggleBlockComment = () => toggleBlockComment(this.view);
}
