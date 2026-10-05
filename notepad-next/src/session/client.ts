import type { DocumentManager } from "../docs/documentManager";
import type { Ipc } from "../ipc";
import { buildSnapshot } from "./snapshot";

/** Debounced session snapshots while editing, plus an immediate flush (e.g. on quit). */
export class SessionClient {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private mgr: DocumentManager,
    private ipc: Ipc,
    private debounceMs = 2000,
  ) {}

  /** Start snapshotting after every change to the tab set or any tab's text. */
  start(): void {
    this.unsubscribe = this.mgr.subscribe(() => this.schedule());
  }

  stop(): void {
    this.unsubscribe?.();
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
