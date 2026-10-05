import type { Range } from "./searchService";

export interface ResultLine {
  line: number;
  text: string;
  from: number;
  to: number;
  /** Set for file results, where navigation is by line and column instead of document offset. */
  col?: { start: number; end: number };
}

export function lineStarts(text: string): number[] {
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

/** Turn match ranges into result lines (1-based line number plus that line's text). */
export function hitsFor(text: string, ranges: Range[]): ResultLine[] {
  const starts = lineStarts(text);
  return ranges.map((r) => {
    const i = lineOf(starts, r.from);
    const end = i + 1 < starts.length ? starts[i + 1] - 1 : text.length;
    return { line: i + 1, text: text.slice(starts[i], end), from: r.from, to: r.to };
  });
}
