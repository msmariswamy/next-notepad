import { EditorState, RangeSet, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, gutter, type DecorationSet } from "@codemirror/view";

/** Notepad++ offers five mark styles; each maps to a CSS class (.cm-mark-1 .. .cm-mark-5). */
export const MARK_STYLES = 5;

export interface MarkRange {
  style: number;
  from: number;
  to: number;
}

interface MarkSpec {
  markStyle: number;
}

const addMarksEffect = StateEffect.define<MarkRange[]>({
  map: (ranges, change) =>
    ranges.map((r) => ({ ...r, from: change.mapPos(r.from, 1), to: change.mapPos(r.to, -1) })),
});
const clearMarksEffect = StateEffect.define<number | "all">();

const markField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    // Decorations follow the text they were placed on as it is edited (spec: "Marks follow edits").
    marks = marks.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(clearMarksEffect)) {
        const which = e.value;
        marks = which === "all" ? Decoration.none : marks.update({ filter: (_f, _t, v) => (v.spec as MarkSpec).markStyle !== which });
      } else if (e.is(addMarksEffect)) {
        const added = e.value
          .filter((r) => r.to > r.from)
          .map((r) => Decoration.mark({ class: `cm-mark-${r.style}`, markStyle: r.style } as MarkSpec).range(r.from, r.to));
        marks = marks.update({ add: added, sort: true });
      }
    }
    return marks;
  },
  provide: (f) => EditorView.decorations.from(f),
});

class BookmarkMarker extends GutterMarker {
  toDOM() {
    const dot = document.createElement("span");
    dot.className = "cm-bookmark";
    dot.textContent = "●";
    return dot;
  }
}
const bookmark = new BookmarkMarker();

const setBookmarksEffect = StateEffect.define<{ add: number[]; remove: number[] }>();
const clearBookmarksEffect = StateEffect.define<null>();

const bookmarkField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(set, tr) {
    set = set.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(clearBookmarksEffect)) set = RangeSet.empty;
      else if (e.is(setBookmarksEffect)) {
        const drop = new Set(e.value.remove);
        set = set.update({
          filter: (from) => !drop.has(from),
          add: e.value.add.map((p) => bookmark.range(p)),
          sort: true,
        });
      }
    }
    return set;
  },
});

export function marksExtension(): Extension[] {
  return [
    markField,
    bookmarkField,
    gutter({
      class: "cm-bookmark-gutter",
      markers: (v) => v.state.field(bookmarkField),
      initialSpacer: () => bookmark,
      domEventHandlers: {
        // Clicking the gutter toggles a bookmark on that line, like Notepad++'s bookmark margin.
        mousedown(view, line) {
          toggleBookmark(view, line.from);
          return true;
        },
      },
    }),
  ];
}

// ---- marks

/** Add marks in one style; with `purge`, existing marks of that style are cleared first (same transaction). */
export function addMarks(view: EditorView, style: number, ranges: { from: number; to: number }[], purge = false): void {
  view.dispatch({
    effects: [...(purge ? [clearMarksEffect.of(style)] : []), addMarksEffect.of(ranges.map((r) => ({ style, ...r })))],
  });
}

export function clearMarks(view: EditorView, style?: number): void {
  view.dispatch({ effects: clearMarksEffect.of(style ?? "all") });
}

export function getMarks(state: EditorState): MarkRange[] {
  const out: MarkRange[] = [];
  const cursor = state.field(markField).iter();
  while (cursor.value) {
    out.push({ style: (cursor.value.spec as MarkSpec).markStyle, from: cursor.from, to: cursor.to });
    cursor.next();
  }
  return out;
}

// ---- bookmarks (one marker per line, anchored at the line start)

export function getBookmarkPositions(state: EditorState): number[] {
  const out: number[] = [];
  const cursor = state.field(bookmarkField).iter();
  while (cursor.value) {
    out.push(cursor.from);
    cursor.next();
  }
  return out;
}

/** 1-based line numbers of all bookmarks, ascending. */
export function getBookmarkLines(state: EditorState): number[] {
  return getBookmarkPositions(state).map((p) => state.doc.lineAt(p).number);
}

export function toggleBookmark(view: EditorView, pos: number): void {
  const line = view.state.doc.lineAt(pos);
  const has = getBookmarkPositions(view.state).includes(line.from);
  view.dispatch({ effects: setBookmarksEffect.of(has ? { add: [], remove: [line.from] } : { add: [line.from], remove: [] }) });
}

export function addBookmarks(view: EditorView, positions: number[]): void {
  const starts = new Set(positions.map((p) => view.state.doc.lineAt(p).from));
  const existing = new Set(getBookmarkPositions(view.state));
  const add = [...starts].filter((p) => !existing.has(p));
  if (add.length) view.dispatch({ effects: setBookmarksEffect.of({ add, remove: [] }) });
}

export function clearBookmarks(view: EditorView): void {
  view.dispatch({ effects: clearBookmarksEffect.of(null) });
}

/** Line start of the next/previous bookmark relative to `pos`, wrapping around; null when there are none. */
export function neighbourBookmark(state: EditorState, pos: number, backward: boolean): number | null {
  const marks = getBookmarkPositions(state);
  if (marks.length === 0) return null;
  const here = state.doc.lineAt(pos).from;
  if (!backward) return marks.find((m) => m > here) ?? marks[0];
  return [...marks].reverse().find((m) => m < here) ?? marks[marks.length - 1];
}
