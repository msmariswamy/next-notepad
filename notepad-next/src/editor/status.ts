export type Eol = "lf" | "crlf" | "cr";

export interface StatusInfo {
  line: number;
  column: number;
  /** Characters in the selection (0 when nothing is selected). */
  selectionLength: number;
  /** Lines touched by the selection (0 when nothing is selected). */
  selectionLines: number;
  length: number;
  lines: number;
  eol: Eol;
  encoding: string;
  language: string;
  /** The tab's file no longer exists on disk (restored from a session). */
  missing?: boolean;
}

const EOL_LABEL: Record<Eol, string> = { lf: "Unix (LF)", crlf: "Windows (CR LF)", cr: "Mac (CR)" };

export function eolLabel(eol: Eol): string {
  return EOL_LABEL[eol];
}

/** Segments shown left to right in the status bar. */
export function formatStatus(s: StatusInfo): string[] {
  const sel = s.selectionLength > 0 ? `Sel: ${s.selectionLength} | ${s.selectionLines}` : "Sel: 0 | 0";
  return [
    s.missing ? `${s.language}   ⚠ File not found on disk` : s.language,
    `length: ${s.length}   lines: ${s.lines}`,
    `Ln: ${s.line}   Col: ${s.column}   ${sel}`,
    eolLabel(s.eol),
    s.encoding,
  ];
}
