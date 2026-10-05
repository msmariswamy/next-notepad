import type { FilesApi } from "./filesSearch";

/** `*` / `?` wildcard filter match, like the Rust walker (case-insensitive, `;`/`,`/space separated, `!` excludes). */
export function matchesFilter(name: string, spec: string): boolean {
  const filters = spec.split(/[;, ]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const re = (p: string) => new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
  const n = name.toLowerCase();
  if (filters.some((f) => f.startsWith("!") && re(f.slice(1)).test(n))) return false;
  const includes = filters.filter((f) => !f.startsWith("!"));
  return includes.length === 0 || includes.some((f) => f === "*.*" || re(f).test(n));
}

/**
 * In-memory directory search for the browser host and e2e tests. It always reports `needsJs`,
 * so it exercises the same file-streaming path real lookahead/backreference searches use.
 */
export function createMemoryFilesApi(files: Map<string, string>): FilesApi {
  return {
    async search(_job, request, onEvent) {
      const root = request.root.replace(/\/$/, "") + "/";
      let searched = 0;
      for (const [path, text] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
        if (!path.startsWith(root)) continue;
        const rel = path.slice(root.length);
        if (!request.recursive && rel.includes("/")) continue;
        if (!request.includeHidden && rel.split("/").some((p) => p.startsWith("."))) continue;
        if (!matchesFilter(rel.split("/").pop()!, request.filters)) continue;
        searched++;
        onEvent({ type: "file", path, text });
      }
      return { filesSearched: searched, filesMatched: 0, hits: 0, skippedBinary: 0, skippedUnreadable: 0, skippedTooLarge: 0, cancelled: false, needsJs: true, truncated: false };
    },
    async replace() {
      throw new Error("the in-memory host replaces through the frontend path");
    },
    async cancel() {},
  };
}
