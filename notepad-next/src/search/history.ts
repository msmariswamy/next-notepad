const MAX = 20;

/** Most-recent-first list of earlier search terms, persisted in the webview's localStorage. */
export class SearchHistory {
  private items: string[];

  constructor(private key: string) {
    this.items = this.read();
  }

  private read(): string[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(this.key) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, MAX) : [];
    } catch {
      return []; // storage blocked or corrupt: history is a convenience, never an error
    }
  }

  list(): string[] {
    return [...this.items];
  }

  add(value: string): void {
    if (value === "") return;
    this.items = [value, ...this.items.filter((v) => v !== value)].slice(0, MAX);
    try {
      localStorage.setItem(this.key, JSON.stringify(this.items));
    } catch {
      /* keep the in-memory list even if persisting fails */
    }
  }
}
