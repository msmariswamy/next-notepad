import type { App } from "../app/app";
import type { Settings } from "../settings/model";
import { LINE_PX, contentHeight, isMapDisabled, lineRow, rowCount, scrollTopForMapY, viewportRect } from "./geometry";

const DEFAULT_DEBOUNCE_MS = 100;
const FALLBACK_HEIGHT = 400;
const FALLBACK_WIDTH = 200;
const MAX_COLUMNS = 120;
const COLUMN_PX = 1.2;

/**
 * Right-docked Document Map (spec: document-map): a canvas overview of the whole document with a
 * highlighted viewport, click/drag to scroll, and an automatic cutoff for large documents (design D4).
 * The text layer is redrawn on a debounce; the viewport highlight is a plain div so scrolling stays cheap.
 */
export class DocumentMapPanel {
  private body: HTMLElement;
  private canvas: HTMLCanvasElement;
  private viewport: HTMLElement;
  private notice: HTMLElement;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsubs: (() => void)[] = [];
  private dragging = false;
  private lines = 0;
  private resizeObserver: ResizeObserver | null = null;
  private onScroll = () => this.updateViewport();

  constructor(
    private el: HTMLElement,
    private app: App,
    private settings: () => Settings,
    private debounceMs = DEFAULT_DEBOUNCE_MS,
  ) {
    el.classList.add("document-map");
    el.innerHTML = '<div class="panel-title">Document Map</div>';
    this.notice = document.createElement("div");
    this.notice.className = "dm-notice";
    this.notice.setAttribute("data-testid", "dm-notice");
    this.notice.hidden = true;
    this.body = document.createElement("div");
    this.body.className = "dm-body";
    this.body.setAttribute("data-testid", "dm-body");
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("data-testid", "dm-canvas");
    this.viewport = document.createElement("div");
    this.viewport.className = "dm-viewport";
    this.viewport.setAttribute("data-testid", "dm-viewport");
    this.body.append(this.canvas, this.viewport);
    el.append(this.notice, this.body);

    this.body.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      // Keep receiving moves when the pointer leaves the strip while dragging (absent in some test environments).
      (e.target as Element | null)?.setPointerCapture?.((e as PointerEvent).pointerId);
      this.scrollToPointer(e);
    });
    this.body.addEventListener("pointermove", (e) => {
      if (this.dragging) this.scrollToPointer(e);
    });
    const stop = () => (this.dragging = false);
    this.body.addEventListener("pointerup", stop);
    this.body.addEventListener("pointercancel", stop);

    app.view.scrollDOM.addEventListener("scroll", this.onScroll);
    this.unsubs.push(
      app.onEditorUpdate((u) => {
        if (u.docChanged) this.schedule();
        else if (u.geometryChanged || u.viewportChanged) this.updateViewport();
      }),
      app.manager.subscribe(() => this.schedule()),
    );
    if (typeof ResizeObserver === "function") {
      this.resizeObserver = new ResizeObserver(() => this.schedule());
      this.resizeObserver.observe(this.body);
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.app.view.scrollDOM.removeEventListener("scroll", this.onScroll);
    this.resizeObserver?.disconnect();
    for (const off of this.unsubs) off();
  }

  schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refreshNow(), this.debounceMs);
  }

  /** Redraw the map now. Does nothing while hidden; shows a notice instead of drawing for large documents. */
  refreshNow(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.el.hidden) return;
    const doc = this.app.view.state.doc;
    if (isMapDisabled(doc.lines, doc.length, this.settings().largeFileThresholdBytes)) {
      this.notice.hidden = false;
      this.notice.textContent = "Document Map is off for large documents";
      this.body.hidden = true;
      return;
    }
    this.notice.hidden = true;
    this.body.hidden = false;
    this.lines = doc.lines;
    this.body.dataset.lines = String(doc.lines);
    this.draw();
    this.updateViewport();
  }

  private mapHeight(): number {
    return this.body.clientHeight || FALLBACK_HEIGHT;
  }

  private draw(): void {
    const doc = this.app.view.state.doc;
    const h = this.mapHeight();
    const w = this.body.clientWidth || FALLBACK_WIDTH;
    const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
    const rows = rowCount(doc.lines, h);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${rows * LINE_PX}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(rows * LINE_PX * dpr);
    const ctx = this.canvas.getContext?.("2d");
    if (!ctx) return; // no canvas support (tests): geometry and the viewport highlight still work

    // Per row: where the text starts and how far it reaches, merged over the lines that share the row.
    const start = new Array<number>(rows).fill(Infinity);
    const end = new Array<number>(rows).fill(0);
    for (let i = 0; i < doc.lines; i++) {
      const text = doc.line(i + 1).text;
      const trimmed = text.trimStart();
      if (trimmed === "") continue;
      const row = lineRow(i, doc.lines, h);
      start[row] = Math.min(start[row], text.length - trimmed.length);
      end[row] = Math.max(end[row], Math.min(text.length, MAX_COLUMNS));
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, rows * LINE_PX);
    ctx.fillStyle = getComputedStyle(this.el).color || "#888";
    ctx.globalAlpha = 0.45;
    for (let r = 0; r < rows; r++) {
      if (end[r] <= start[r]) continue;
      const x = Math.min(start[r], 60) * COLUMN_PX;
      ctx.fillRect(x, r * LINE_PX, Math.max(1, (end[r] - start[r]) * COLUMN_PX), 1);
    }
  }

  /** Move the highlighted rectangle to the editor's current scroll position. */
  updateViewport(): void {
    if (this.el.hidden || this.body.hidden) return;
    const r = viewportRect(this.metrics(), contentHeight(this.lines || 1, this.mapHeight()));
    this.viewport.style.top = `${r.top}px`;
    this.viewport.style.height = `${r.height}px`;
  }

  private metrics() {
    const sd = this.app.view.scrollDOM;
    return { scrollTop: sd.scrollTop, clientHeight: sd.clientHeight, scrollHeight: sd.scrollHeight };
  }

  private scrollToPointer(e: MouseEvent): void {
    const y = e.clientY - this.body.getBoundingClientRect().top;
    this.app.view.scrollDOM.scrollTop = scrollTopForMapY(y, contentHeight(this.lines || 1, this.mapHeight()), this.metrics());
  }
}
