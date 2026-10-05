import type { DocumentManager } from "../docs/documentManager";
import type { Ipc } from "../ipc";
import { buildSnapshot } from "./snapshot";

/** Debounced session snapshots while editing, plus an immediate flush (e.g. on quit). */
export class SessionClient {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;
  private unsubscribeView: (() => void) | null = null;

  constructor(
    private mgr: DocumentManager,
    private ipc: Ipc,
    private debounceMs = 2000,
  ) {}

  /** Start snapshotting after every change to the tab set, any tab's text, or a tab's caret or scroll position. */
  start(): void {
    this.unsubscribe = this.mgr.subscribe(() => this.schedule());
    // schedule() only restarts the existing debounce, so a stream of scroll events still writes at most once per interval after it stops.
    this.unsubscribeView = this.mgr.subscribeView(() => this.schedule());
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribeView?.();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.debounceMs);
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.ipc.invoke("save_session", { snapshot: buildSnapshot(this.mgr) });
  }
}
