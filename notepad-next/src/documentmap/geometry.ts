/** Above this many lines the Document Map is switched off (spec: document-map, large document cutoff). */
export const MAX_MAP_LINES = 50_000;

/** Pixels the map spends on each line while the whole document fits. */
export const LINE_PX = 2;

export interface ScrollMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

export function isMapDisabled(lines: number, length: number, largeFileThreshold: number): boolean {
  return lines > MAX_MAP_LINES || length > largeFileThreshold;
}

/** Rows the map draws: one per line when they fit, otherwise as many as the height allows. */
export function rowCount(lines: number, mapHeight: number): number {
  return Math.max(1, Math.min(lines, Math.floor(mapHeight / LINE_PX)));
}

export function contentHeight(lines: number, mapHeight: number): number {
  return rowCount(lines, mapHeight) * LINE_PX;
}

/** Row of a zero-based line index; long documents share rows. */
export function lineRow(line: number, lines: number, mapHeight: number): number {
  const rows = rowCount(lines, mapHeight);
  if (lines <= rows) return line;
  return Math.min(rows - 1, Math.floor((line * rows) / lines));
}

/** The highlighted rectangle: the visible part of the document in map pixels. */
export function viewportRect(m: ScrollMetrics, mapContentHeight: number): { top: number; height: number } {
  if (m.scrollHeight <= 0 || m.scrollHeight <= m.clientHeight) return { top: 0, height: mapContentHeight };
  const height = Math.max(4, Math.min(mapContentHeight, (m.clientHeight / m.scrollHeight) * mapContentHeight));
  const top = Math.min(mapContentHeight - height, Math.max(0, (m.scrollTop / m.scrollHeight) * mapContentHeight));
  return { top, height };
}

/** Editor scrollTop that puts the visible part's centre at map position y (click or drag). */
export function scrollTopForMapY(y: number, mapContentHeight: number, m: Pick<ScrollMetrics, "clientHeight" | "scrollHeight">): number {
  const max = Math.max(0, m.scrollHeight - m.clientHeight);
  if (max === 0 || mapContentHeight <= 0) return 0;
  const target = (y / mapContentHeight) * m.scrollHeight - m.clientHeight / 2;
  return Math.min(max, Math.max(0, target));
}
