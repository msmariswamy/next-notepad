import type { App } from "../app/app";
import { detectLanguage } from "../lang/languages";

/** A request from the `next-notepad` command (or a macOS open event), as the Rust server hands it over. */
export interface OpenRequest {
  id: number;
  paths: string[];
  wait: boolean;
}

/** The channel to the Rust side; the Tauri implementation is in tauriHost.ts and tests use a fake. */
export interface OpenRequestHost {
  /** Subscribe to requests; resolves once the listener is registered. */
  listen(handler: (req: OpenRequest) => void | Promise<void>): Promise<() => void>;
  /** The listener is in place: Rust may now deliver queued requests. */
  ready(): Promise<void>;
  /** The files are open (no error) or could not be opened (`error`). */
  opened(id: number, error?: string): Promise<void>;
  /** The user is done with the request's files. */
  finish(id: number): Promise<void>;
  /** The app is quitting normally: every waiting command is done. */
  finishAll(): Promise<void>;
}

/** What the OS says when a file is missing, on macOS, Linux and Windows (os error 2 and 3). */
const MISSING = /No such file|cannot find the (file|path)|os error [23]\b/i;

/**
 * Carries out requests from the command line (spec: cli-open-files, design D5, D6): opens or focuses each file,
 * answers the Rust side, and in wait mode reports when every one of the request's tabs has been closed.
 */
export class OpenRequestHandler {
  /** Waiting requests and the tabs still open for them. */
  private pending = new Map<number, Set<string>>();
  private unsubs: (() => void)[] = [];

  constructor(
    private app: App,
    private host: OpenRequestHost,
  ) {}

  async start(): Promise<void> {
    this.unsubs.push(await this.host.listen((req) => this.handle(req)));
    this.unsubs.push(this.app.manager.subscribe(() => this.check()));
    // Only now that the listener exists may Rust deliver requests that arrived while the window was loading.
    await this.host.ready();
  }

  stop(): void {
    for (const off of this.unsubs) off();
    this.unsubs = [];
  }

  /** The app is quitting normally: tell every waiting command it is done. */
  async finishAll(): Promise<void> {
    if (this.pending.size === 0) return;
    this.pending.clear();
    await this.host.finishAll();
  }

  private async handle(req: OpenRequest): Promise<void> {
    const tabs = new Set<string>();
    for (const path of req.paths) {
      try {
        const id = await this.openOne(path);
        if (id === null) return void (await this.host.opened(req.id, `${path} was not opened`));
        tabs.add(id);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return void (await this.host.opened(req.id, message));
      }
    }
    if (req.wait) this.pending.set(req.id, tabs);
    await this.host.opened(req.id);
    this.app.view.focus();
    // The tabs may already be gone by the time the answer was sent.
    this.check();
  }

  /** Open a file, focus it if it is already open, or open an empty tab bound to a path that does not exist yet. */
  private async openOne(path: string): Promise<string | null> {
    try {
      return await this.app.openPath(path);
    } catch (e) {
      if (!MISSING.test(String(e instanceof Error ? e.message : e))) throw e;
      const doc = this.app.manager.openFile(path, { text: "", encoding: "UTF-8", bom: false, eol: "lf" });
      this.app.manager.setLanguage(doc.id, detectLanguage(path));
      return doc.id;
    }
  }

  /** Finish every waiting request whose tabs have all been closed. */
  private check(): void {
    for (const [id, tabs] of this.pending) {
      for (const tab of tabs) if (!this.app.manager.get(tab)) tabs.delete(tab);
      if (tabs.size === 0) {
        this.pending.delete(id);
        void this.host.finish(id);
      }
    }
  }
}
