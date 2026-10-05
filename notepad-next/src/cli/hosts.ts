import type { Ipc } from "../ipc";
import type { OpenRequest, OpenRequestHost } from "./openRequests";

/** The real channel: the Rust server emits `open-request` and the frontend answers through commands. */
export function tauriOpenHost(ipc: Ipc): OpenRequestHost {
  return {
    async listen(handler) {
      const { listen } = await import("@tauri-apps/api/event");
      return listen<OpenRequest>("open-request", (event) => void handler(event.payload));
    },
    ready: () => ipc.invoke("cli_ready"),
    opened: (id, error) => ipc.invoke("open_request_opened", { id, error: error ?? null }),
    finish: (id) => ipc.invoke("finish_open_request", { id }),
    finishAll: () => ipc.invoke("finish_all_open_requests"),
  };
}

/** What end-to-end tests use to act as the command line in the browser harness. */
export interface OpenTestHook {
  /** Deliver a request as if `next-notepad` had sent it. */
  open(req: OpenRequest): Promise<void>;
  /** What the frontend told the Rust side, in order: `ready`, `opened:<id>[:error:<m>]`, `finish:<id>`, `finishAll`. */
  log: string[];
  /** Quit the way the window's close button does, finishing pending waits. Set by main.ts. */
  requestQuit?: () => Promise<boolean>;
}

declare global {
  interface Window {
    __nextNotepadTest?: OpenTestHook;
  }
}

/** Browser harness: there is no Rust side, so requests come from `window.__nextNotepadTest.open(...)` and answers are logged. */
export function browserOpenHost(): OpenRequestHost {
  let handler: ((req: OpenRequest) => void | Promise<void>) | null = null;
  const log: string[] = [];
  window.__nextNotepadTest = { log, open: async (req) => void (await handler?.(req)) };
  return {
    async listen(h) {
      handler = h;
      return () => (handler = null);
    },
    async ready() {
      log.push("ready");
    },
    async opened(id, error) {
      log.push(error ? `opened:${id}:error:${error}` : `opened:${id}`);
    },
    async finish(id) {
      log.push(`finish:${id}`);
    },
    async finishAll() {
      log.push("finishAll");
    },
  };
}
