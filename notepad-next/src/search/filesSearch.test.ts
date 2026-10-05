import { describe, expect, it, vi } from "vitest";
import { createMockIpc } from "../ipc";
import { DEFAULT_PATTERN_OPTIONS, type PatternOptions } from "./regexCompat";
import type { Query } from "./searchService";
import {
  FilesSearchController,
  applyChanges,
  type FilesApi,
  type FindEvent,
  type FindSummary,
  type Where,
} from "./filesSearch";

const summary = (over: Partial<FindSummary> = {}): FindSummary => ({
  filesSearched: 0,
  filesMatched: 0,
  hits: 0,
  skippedBinary: 0,
  skippedUnreadable: 0,
  skippedTooLarge: 0,
  cancelled: false,
  needsJs: false,
  truncated: false,
  ...over,
});
const q = (pattern: string, over: Partial<PatternOptions> = {}, replacement = ""): Query => ({
  pattern,
  replacement,
  opts: { ...DEFAULT_PATTERN_OPTIONS, ...over },
});
const where: Where = { root: "/proj", filters: "*.*", recursive: true, includeHidden: false };

function fakeApi(events: FindEvent[], sum: FindSummary, replaceResult = { filesChanged: 0, replacements: 0, skippedUnreadable: 0 }) {
  const api: FilesApi & { search: ReturnType<typeof vi.fn>; replace: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> } = {
    search: vi.fn(async (_job, _req, onEvent) => {
      events.forEach(onEvent);
      return sum;
    }),
    replace: vi.fn(async () => replaceResult),
    cancel: vi.fn(async () => {}),
  };
  return api;
}

describe("find (Rust engine hits)", () => {
  it("groups hits by file with line, text and columns", async () => {
    const api = fakeApi(
      [
        { type: "hit", path: "/proj/b.txt", line: 2, text: "two TODO", start: 4, end: 8 },
        { type: "hit", path: "/proj/a.txt", line: 1, text: "TODO one", start: 0, end: 4 },
      ],
      summary({ filesSearched: 2, filesMatched: 2, hits: 2 }),
    );
    const out = await new FilesSearchController(api, createMockIpc({}), () => 1e6).find(q("TODO"), where);
    expect(out.summary).toBe('Search "TODO" (2 hits in 2 files)');
    expect(out.results.map((r) => r.path)).toEqual(["/proj/a.txt", "/proj/b.txt"]);
    expect(out.results[1].hits[0]).toMatchObject({ line: 2, text: "two TODO", col: { start: 4, end: 8 } });
  });

  it("sends the pattern, options, folder, filters and toggles to the backend", async () => {
    const api = fakeApi([], summary());
    await new FilesSearchController(api, createMockIpc({}), () => 123).find(q("x", { mode: "regex", wholeWord: true }), { ...where, recursive: false, includeHidden: true, filters: "*.md" });
    expect(api.search.mock.calls[0][1]).toEqual({
      pattern: "x",
      options: { ...DEFAULT_PATTERN_OPTIONS, mode: "regex", wholeWord: true },
      root: "/proj",
      filters: "*.md",
      recursive: false,
      includeHidden: true,
      maxFileBytes: 123,
    });
  });

  it("notes skipped files and cancellation in the summary", async () => {
    const api = fakeApi([], summary({ skippedBinary: 1, skippedUnreadable: 1, cancelled: true }));
    const out = await new FilesSearchController(api, createMockIpc({}), () => 1).find(q("x"), where);
    expect(out.summary).toBe('Search "x" (0 hits in 0 files) - cancelled, 2 files skipped');
  });

  it("streams partial results to onProgress", async () => {
    const events: FindEvent[] = Array.from({ length: 120 }, (_, i) => ({ type: "hit" as const, path: `/p/${i}.txt`, line: 1, text: "x", start: 0, end: 1 }));
    const api = fakeApi(events, summary());
    const progress = vi.fn();
    await new FilesSearchController(api, createMockIpc({}), () => 1).find(q("x"), where, progress);
    expect(progress).toHaveBeenCalled();
  });

  it("cancel asks the backend to stop the running job", async () => {
    let release!: () => void;
    const api = fakeApi([], summary());
    api.search.mockImplementation(() => new Promise((r) => (release = () => r(summary({ cancelled: true })))));
    const c = new FilesSearchController(api, createMockIpc({}), () => 1);
    const pending = c.find(q("x"), where);
    await c.cancel();
    expect(api.cancel).toHaveBeenCalledWith(expect.stringMatching(/^job-/));
    release();
    expect((await pending).summaryStats.cancelled).toBe(true);
  });
});

describe("find (JS engine fallback)", () => {
  it("matches streamed file contents with the JS engine, including lookahead", async () => {
    const api = fakeApi(
      [
        { type: "file", path: "/proj/a.txt", text: "foobar foobaz" },
        { type: "file", path: "/proj/b.txt", text: "nothing" },
      ],
      summary({ needsJs: true, filesSearched: 2 }),
    );
    const out = await new FilesSearchController(api, createMockIpc({}), () => 1).find(q("foo(?=bar)", { mode: "regex" }), where);
    expect(out.summary).toBe('Search "foo(?=bar)" (1 hit in 1 file)');
    expect(out.results[0].hits[0]).toMatchObject({ line: 1, text: "foobar foobaz", col: { start: 0, end: 3 } });
  });

  it("computes line numbers and columns across lines", async () => {
    const api = fakeApi([{ type: "file", path: "/p/a.txt", text: "one\ntwo needle" }], summary({ needsJs: true }));
    const out = await new FilesSearchController(api, createMockIpc({}), () => 1).find(q("needle"), where);
    expect(out.results[0].hits[0]).toMatchObject({ line: 2, text: "two needle", col: { start: 4, end: 10 } });
  });

  it("surfaces an invalid pattern as a SyntaxError", async () => {
    const api = fakeApi([{ type: "file", path: "/p/a.txt", text: "x" }], summary({ needsJs: true }));
    await expect(new FilesSearchController(api, createMockIpc({}), () => 1).find(q("(bad", { mode: "regex" }), where)).rejects.toThrow(SyntaxError);
  });
});

describe("Replace in Files", () => {
  it("asks for confirmation with the file count and writes nothing when declined", async () => {
    const api = fakeApi(
      [{ type: "hit", path: "/p/a.txt", line: 1, text: "foo", start: 0, end: 3 }, { type: "hit", path: "/p/b.txt", line: 1, text: "foo", start: 0, end: 3 }],
      summary({ filesMatched: 2, hits: 2 }),
    );
    const confirm = vi.fn(async () => false);
    const r = await new FilesSearchController(api, createMockIpc({}), () => 1).replaceInFiles(q("foo", {}, "bar"), where, confirm);
    expect(confirm).toHaveBeenCalledWith(2);
    expect(r.status).toBe("cancelled");
    expect(api.replace).not.toHaveBeenCalled();
  });

  it("replaces through the Rust engine once confirmed", async () => {
    const api = fakeApi(
      [{ type: "hit", path: "/p/a.txt", line: 1, text: "foo", start: 0, end: 3 }],
      summary({ filesMatched: 1, hits: 1 }),
      { filesChanged: 1, replacements: 1, skippedUnreadable: 0 },
    );
    const r = await new FilesSearchController(api, createMockIpc({}), () => 1).replaceInFiles(q("foo", {}, "bar"), where, async () => true);
    expect(api.replace).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ pattern: "foo" }), "bar");
    expect(r).toEqual({ status: "done", files: 1, replacements: 1 });
  });

  it("does nothing and does not ask when there are no matches", async () => {
    const api = fakeApi([], summary());
    const confirm = vi.fn(async () => true);
    const r = await new FilesSearchController(api, createMockIpc({}), () => 1).replaceInFiles(q("foo", {}, "bar"), where, confirm);
    expect(confirm).not.toHaveBeenCalled();
    expect(r.status).toBe("cancelled");
  });

  it("replaces JS-engine patterns in the frontend and saves via the normal save path", async () => {
    const api = fakeApi([{ type: "file", path: "/p/a.txt", text: "foobar foobaz" }], summary({ needsJs: true }));
    const ipc = createMockIpc({
      open_file: () => ({ text: "foobar foobaz", encoding: "UTF-8", bom: false, eol: "crlf" }),
      save_file_cmd: () => undefined,
    });
    const r = await new FilesSearchController(api, ipc, () => 1).replaceInFiles(q("foo(?=bar)", { mode: "regex" }, "X"), where, async () => true);
    expect(api.replace).not.toHaveBeenCalled();
    expect(ipc.calls.find((c) => c.command === "save_file_cmd")?.args).toEqual({
      path: "/p/a.txt",
      text: "Xbar foobaz",
      encoding: "UTF-8",
      bom: false,
      eol: "crlf",
    });
    expect(r).toEqual({ status: "done", files: 1, replacements: 1 });
  });
});

describe("applyChanges", () => {
  it("applies non-overlapping changes in order", () => {
    expect(applyChanges("a b c", [{ from: 4, to: 5, insert: "Z" }, { from: 0, to: 1, insert: "X" }])).toBe("X b Z");
  });
});
