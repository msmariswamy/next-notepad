import type { Ipc } from "../ipc";
import type { LoadedFile } from "../docs/documentManager";
import type { DocResults, SearchOutcome } from "./findController";
import { hitsFor, type ResultLine } from "./resultLines";
import type { PatternOptions } from "./regexCompat";
import { findAll, planReplaceAll, type Change, type Query } from "./searchService";

/** Mirrors the Rust `FindRequest` (camelCase JSON). */
export interface FindRequest {
  pattern: string;
  options: PatternOptions;
  root: string;
  filters: string;
  recursive: boolean;
  includeHidden: boolean;
  maxFileBytes: number;
}

export type FindEvent =
  | { type: "hit"; path: string; line: number; text: string; start: number; end: number }
  | { type: "file"; path: string; text: string };

export interface FindSummary {
  filesSearched: number;
  filesMatched: number;
  hits: number;
  skippedBinary: number;
  skippedUnreadable: number;
  skippedTooLarge: number;
  cancelled: boolean;
  needsJs: boolean;
  truncated: boolean;
}

export interface ReplaceSummary {
  filesChanged: number;
  replacements: number;
  skippedUnreadable: number;
}

/** Backend operations for directory search; Tauri-backed in the app, faked in tests and the browser host. */
export interface FilesApi {
  search(jobId: string, request: FindRequest, onEvent: (e: FindEvent) => void): Promise<FindSummary>;
  replace(jobId: string, request: FindRequest, replacement: string): Promise<ReplaceSummary>;
  cancel(jobId: string): Promise<void>;
}

export interface Where {
  root: string;
  filters: string;
  recursive: boolean;
  includeHidden: boolean;
}

export interface FilesOutcome extends SearchOutcome {
  summaryStats: FindSummary;
}

export function applyChanges(text: string, changes: Change[]): string {
  let out = "";
  let last = 0;
  for (const c of [...changes].sort((a, b) => a.from - b.from)) {
    out += text.slice(last, c.from) + c.insert;
    last = c.to;
  }
  return out + text.slice(last);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

let nextJob = 1;

/**
 * Find in Files / Find in Projects. Patterns the Rust engine can run produce hits directly; others
 * arrive as file contents and are matched here with the same JS engine as in-editor search (ADR-0003).
 */
export class FilesSearchController {
  private activeJob: string | null = null;

  constructor(
    private api: FilesApi,
    private ipc: Ipc,
    private maxFileBytes: () => number,
  ) {}

  private request(q: Query, w: Where): FindRequest {
    return { pattern: q.pattern, options: q.opts, root: w.root, filters: w.filters, recursive: w.recursive, includeHidden: w.includeHidden, maxFileBytes: this.maxFileBytes() };
  }

  private newJob(): string {
    this.activeJob = `job-${nextJob++}`;
    return this.activeJob;
  }

  async cancel(): Promise<void> {
    if (this.activeJob) await this.api.cancel(this.activeJob);
  }

  /** Search `w.root`; `onProgress` gets the partial outcome as results stream in. */
  async find(q: Query, w: Where, onProgress?: (o: FilesOutcome) => void): Promise<FilesOutcome> {
    const byPath = new Map<string, ResultLine[]>();
    const add = (path: string, lines: ResultLine[]) => byPath.set(path, [...(byPath.get(path) ?? []), ...lines]);
    let lastSummary: FindSummary | null = null;
    const snapshot = (): FilesOutcome => this.outcome(q, byPath, lastSummary ?? emptySummary());

    const jobId = this.newJob();
    let pending = 0;
    const summary = await this.api.search(jobId, this.request(q, w), (e) => {
      if (e.type === "hit") {
        add(e.path, [{ line: e.line, text: e.text, from: 0, to: 0, col: { start: e.start, end: e.end } }]);
      } else {
        // JS fallback: match the streamed contents here (SyntaxError propagates for an invalid pattern).
        const ranges = findAll(e.text, q);
        if (ranges.length) add(e.path, hitsFor(e.text, ranges).map((h) => ({ ...h, col: colsFor(e.text, h) })));
      }
      if (onProgress && ++pending % 50 === 0) onProgress(snapshot());
    });
    this.activeJob = null;
    lastSummary = summary;
    // For the JS path the backend cannot know the hit counts, so recompute them from what we matched.
    lastSummary = { ...summary, hits: [...byPath.values()].reduce((n, l) => n + l.length, 0), filesMatched: byPath.size };
    return snapshot();
  }

  private outcome(q: Query, byPath: Map<string, ResultLine[]>, s: FindSummary): FilesOutcome {
    const results: DocResults[] = [...byPath.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, hits]) => ({ docId: path, title: path, path, hits }));
    const total = results.reduce((n, r) => n + r.hits.length, 0);
    const skipped = s.skippedBinary + s.skippedUnreadable + s.skippedTooLarge;
    const notes = [
      s.cancelled ? "cancelled" : "",
      skipped ? `${plural(skipped, "file")} skipped` : "",
      s.truncated ? "results truncated" : "",
    ].filter(Boolean);
    return {
      summary: `Search "${q.pattern}" (${plural(total, "hit")} in ${plural(results.length, "file")})${notes.length ? ` - ${notes.join(", ")}` : ""}`,
      results,
      summaryStats: s,
    };
  }

  /**
   * Replace across the directory. Always asks `confirm(fileCount)` first so nothing is written
   * until the user has seen how many files will change.
   */
  async replaceInFiles(
    q: Query,
    w: Where,
    confirm: (files: number) => Promise<boolean>,
  ): Promise<{ status: "cancelled" | "done"; files: number; replacements: number }> {
    const preview = await this.find(q, w);
    const files = preview.results.length;
    if (files === 0 || !(await confirm(files))) return { status: "cancelled", files: 0, replacements: 0 };

    if (!preview.summaryStats.needsJs) {
      const r = await this.api.replace(this.newJob(), this.request(q, w), q.replacement);
      this.activeJob = null;
      return { status: "done", files: r.filesChanged, replacements: r.replacements };
    }
    // JS-engine patterns: compute each replacement here, then write through the normal save path.
    let replacements = 0;
    let changed = 0;
    for (const doc of preview.results) {
      const loaded = await this.ipc.invoke<LoadedFile>("open_file", { path: doc.path });
      const changes = planReplaceAll(loaded.text, q);
      if (changes.length === 0) continue;
      await this.ipc.invoke("save_file_cmd", {
        path: doc.path,
        text: applyChanges(loaded.text, changes),
        encoding: loaded.encoding,
        bom: loaded.bom,
        eol: loaded.eol,
      });
      replacements += changes.length;
      changed++;
    }
    return { status: "done", files: changed, replacements };
  }
}

function colsFor(text: string, h: ResultLine): { start: number; end: number } {
  const ls = text.lastIndexOf("\n", h.from - 1) + 1;
  return { start: h.from - ls, end: h.to - ls };
}

function emptySummary(): FindSummary {
  return { filesSearched: 0, filesMatched: 0, hits: 0, skippedBinary: 0, skippedUnreadable: 0, skippedTooLarge: 0, cancelled: false, needsJs: false, truncated: false };
}
