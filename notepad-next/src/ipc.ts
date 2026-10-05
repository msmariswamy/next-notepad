import { invoke } from "@tauri-apps/api/core";

/**
 * Narrow interface over Tauri's `invoke` so frontend logic depends on this
 * seam, not on the Tauri runtime. Unit tests swap in a mock (see createMockIpc).
 */
export interface Ipc {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

export const tauriIpc: Ipc = {
  invoke: <T>(command: string, args?: Record<string, unknown>) => invoke<T>(command, args),
};

type Handler = (args?: Record<string, unknown>) => unknown;

export interface MockIpc extends Ipc {
  calls: { command: string; args?: Record<string, unknown> }[];
}

export function createMockIpc(handlers: Record<string, Handler>): MockIpc {
  const calls: MockIpc["calls"] = [];
  return {
    calls,
    async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
      calls.push({ command, args });
      const handler = handlers[command];
      if (!handler) throw new Error(`No mock handler for command: ${command}`);
      return (await handler(args)) as T;
    },
  };
}
