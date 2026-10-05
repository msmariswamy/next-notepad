import { describe, expect, it } from "vitest";
import { createMemoryFilesApi, matchesFilter } from "./memoryFilesApi";
import type { FindEvent, FindRequest } from "./filesSearch";
import { DEFAULT_PATTERN_OPTIONS } from "./regexCompat";

const req = (over: Partial<FindRequest> = {}): FindRequest => ({
  pattern: "x",
  options: DEFAULT_PATTERN_OPTIONS,
  root: "/proj",
  filters: "*.*",
  recursive: true,
  includeHidden: false,
  maxFileBytes: 1e6,
  ...over,
});
const run = async (files: Record<string, string>, r: FindRequest) => {
  const events: FindEvent[] = [];
  await createMemoryFilesApi(new Map(Object.entries(files))).search("j", r, (e) => events.push(e));
  return events.map((e) => e.path);
};

describe("matchesFilter", () => {
  it("handles extensions, wildcards and exclusions", () => {
    expect(matchesFilter("A.TXT", "*.txt;*.md")).toBe(true);
    expect(matchesFilter("a.rs", "*.txt")).toBe(false);
    expect(matchesFilter("a.log", "*.* !*.log")).toBe(false);
    expect(matchesFilter("file1.txt", "file?.txt")).toBe(true);
    expect(matchesFilter("anything", "")).toBe(true);
  });
});

describe("memory files api", () => {
  const files = { "/proj/a.txt": "1", "/proj/sub/b.txt": "2", "/proj/.git/c.txt": "3", "/other/d.txt": "4" };

  it("searches only under the root, skipping hidden folders by default", async () => {
    expect(await run(files, req())).toEqual(["/proj/a.txt", "/proj/sub/b.txt"]);
  });
  it("honours the sub-folder and hidden toggles", async () => {
    expect(await run(files, req({ recursive: false }))).toEqual(["/proj/a.txt"]);
    expect(await run(files, req({ includeHidden: true }))).toEqual(["/proj/.git/c.txt", "/proj/a.txt", "/proj/sub/b.txt"]);
  });
  it("honours the name filter", async () => {
    expect(await run({ ...files, "/proj/e.md": "5" }, req({ filters: "*.md" }))).toEqual(["/proj/e.md"]);
  });
});
