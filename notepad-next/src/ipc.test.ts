import { describe, expect, it } from "vitest";
import { createMockIpc } from "./ipc";

describe("mock ipc", () => {
  it("returns the handler result for a registered command", async () => {
    const ipc = createMockIpc({ ping: () => "pong" });
    expect(await ipc.invoke<string>("ping")).toBe("pong");
  });

  it("records calls with their arguments", async () => {
    const ipc = createMockIpc({ echo: (args) => args });
    await ipc.invoke("echo", { a: 1 });
    expect(ipc.calls).toEqual([{ command: "echo", args: { a: 1 } }]);
  });

  it("rejects for an unregistered command", async () => {
    const ipc = createMockIpc({});
    await expect(ipc.invoke("missing")).rejects.toThrow(/missing/);
  });
});
