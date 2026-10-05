import { syntaxTree } from "@codemirror/language";
import type { App } from "../app/app";
import type { Settings } from "../settings/model";
import { extractSymbols, type Symbol } from "./symbols";

const DEFAULT_DEBOUNCE_MS = 250;

/**
 * Right-docked Function List (spec: function-list): symbols of the active document, a filter box, click to jump.
 * It recomputes on a debounce after edits, tab changes and parse progress, and only while it is visible.
 */
export class FunctionListPanel {
  private symbols: Symbol[] = [];
  private filter = "";
  private notice = "";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsubs: (() => void)[] = [];
  private input: HTMLInputElement;
  private list: HTMLElement;

  constructor(
    private el: HTMLElement,
    private app: App,
    private settings: () => Settings,
    private debounceMs = DEFAULT_DEBOUNCE_MS,
  ) {
    el.classList.add("function-list");
    el.innerHTML = '<div class="panel-title">Function List</div>';
    this.input = document.createElement("input");
    this.input.type = "search";
    this.input.placeholder = "Filter";
    this.input.setAttribute("data-testid", "fl-filter");
    this.input.addEventListener("input", () => {
      this.filter = this.input.value;
      this.renderList();
    });
    this.list = document.createElement("ul");
    this.list.setAttribute("data-testid", "fl-list");
    el.append(this.input, this.list);

    // The editor update covers typing, language loads and background parse progress; the manager covers tab switches.
    this.unsubs.push(
      app.onEditorUpdate((u) => {
        if (u.docChanged || syntaxTree(u.state) !== syntaxTree(u.startState)) this.schedule();
      }),
      app.manager.subscribe(() => this.schedule()),
    );
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    for (const off of this.unsubs) off();
  }

  schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refreshNow(), this.debounceMs);
  }

  /** Recompute now. Keeps the last complete list when the tree is not ready or the document is too large. */
  refreshNow(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.el.hidden) return;
    const doc = this.app.manager.active;
    if (!doc) return;
    const state = this.app.view.state;
    if (state.doc.length > this.settings().largeFileThresholdBytes) {
      this.notice = "Function List is paused for large documents";
      this.renderList();
      return;
    }
    this.notice = "";
    const next = extractSymbols(state, doc.language);
    if (next) this.symbols = next;
    this.renderList();
  }

  private renderList(): void {
    const needle = this.filter.trim().toLowerCase();
    const shown = needle ? this.symbols.filter((s) => s.name.toLowerCase().includes(needle)) : this.symbols;
    this.list.replaceChildren();
    if (this.notice) {
      const n = document.createElement("li");
      n.className = "fl-notice";
      n.setAttribute("data-testid", "fl-notice");
      n.textContent = this.notice;
      this.list.append(n);
    }
    if (shown.length === 0 && !this.notice) {
      const empty = document.createElement("li");
      empty.className = "fl-empty";
      empty.setAttribute("data-testid", "fl-empty");
      empty.textContent = needle ? "No matching symbols" : "No symbols";
      this.list.append(empty);
      return;
    }
    for (const s of shown) {
      const li = document.createElement("li");
      li.className = "fl-item";
      li.setAttribute("data-testid", "fl-item");
      li.innerHTML = '<span class="fl-kind"></span><span class="fl-name"></span><span class="fl-line"></span>';
      li.querySelector(".fl-kind")!.textContent = s.kind;
      li.querySelector(".fl-name")!.textContent = s.name;
      li.querySelector(".fl-line")!.textContent = String(s.line);
      li.addEventListener("click", () => {
        this.app.setSelection({ from: s.from, to: s.from });
        this.app.view.focus();
      });
      this.list.append(li);
    }
  }
}
