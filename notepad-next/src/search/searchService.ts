import { expandReplacement, toJsRegExp, type PatternOptions } from "./regexCompat";

export interface Query {
  pattern: string;
  replacement: string;
  opts: PatternOptions;
}

export interface Range {
  from: number;
  to: number;
}

export interface Change extends Range {
  insert: string;
}

interface Hit extends Range {
  groups: (string | undefined)[];
}

/** Every match, optionally only those lying fully inside `range`. Zero-length matches are kept. */
function collect(text: string, q: Query, range?: Range): Hit[] {
  if (q.pattern === "") return [];
  const re = toJsRegExp(q.pattern, q.opts, "g");
  const hits: Hit[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const from = m.index;
    const to = from + m[0].length;
    if (m[0] === "") re.lastIndex++; // step past a zero-length match or exec would loop forever
    if (range && (from < range.from || to > range.to)) continue;
    hits.push({ from, to, groups: [...m] });
  }
  return hits;
}

export function findAll(text: string, q: Query, range?: Range): Range[] {
  return collect(text, q, range).map(({ from, to }) => ({ from, to }));
}

export function countMatches(text: string, q: Query, range?: Range): number {
  return collect(text, q, range).length;
}

export interface FindOptions {
  backward: boolean;
  wrap: boolean;
  /** Restrict the search to this range (the "In selection" option). */
  range?: Range;
}

/**
 * Next match relative to the current selection. Forward searches start at the
 * selection end, backward searches at its start. A zero-length match sitting
 * on the caret is skipped so repeated Find Next always makes progress.
 */
export function findNext(text: string, q: Query, sel: Range, o: FindOptions): Range | null {
  const hits = collect(text, q, o.range);
  if (hits.length === 0) return null;
  const caretOnly = sel.from === sel.to;
  const pick = (h: Hit | undefined): Range | null => (h ? { from: h.from, to: h.to } : null);
  if (!o.backward) {
    const after = hits.find((h) => h.from >= sel.to && !(caretOnly && h.from === h.to && h.from === sel.from));
    return pick(after ?? (o.wrap ? hits[0] : undefined));
  }
  const before = [...hits].reverse().find((h) => h.to <= sel.from && !(caretOnly && h.from === h.to && h.to === sel.from));
  return pick(before ?? (o.wrap ? hits[hits.length - 1] : undefined));
}

/** All replacements as one change set, so applying it is a single undo step. */
export function planReplaceAll(text: string, q: Query, range?: Range): Change[] {
  return collect(text, q, range).map((h) => ({
    from: h.from,
    to: h.to,
    insert: expandReplacement(q.replacement, h.groups, q.opts.mode),
  }));
}

/** Replace the match that is currently selected; null if the selection is not exactly a match. */
export function planReplaceCurrent(text: string, q: Query, sel: Range): { change: Change; nextFrom: number } | null {
  const hit = collect(text, q).find((h) => h.from === sel.from && h.to === sel.to);
  if (!hit) return null;
  const insert = expandReplacement(q.replacement, hit.groups, q.opts.mode);
  return { change: { from: hit.from, to: hit.to, insert }, nextFrom: hit.from + insert.length };
}
