import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserHost } from "./browserHost";

afterEach(() => {
  window.__nextNotepadDrop = undefined;
});

describe("browser host file drops", () => {
  it("has the hook only while something listens, and delivers the dropped paths in order", async () => {
    const { platform } = createBrowserHost();
    expect(window.__nextNotepadDrop).toBeUndefined();
    const handler = vi.fn();
    const stop = await platform.onFilesDropped!(handler);
    window.__nextNotepadDrop!(["/a.txt", "/b.txt"]);
    expect(handler).toHaveBeenCalledWith(["/a.txt", "/b.txt"]);
    stop();
    expect(window.__nextNotepadDrop).toBeUndefined();
  });

  it("a native drop event on the page does nothing by itself", async () => {
    const { platform } = createBrowserHost();
    const handler = vi.fn();
    await platform.onFilesDropped!(handler);
    document.body.dispatchEvent(new Event("drop", { bubbles: true }));
    expect(handler).not.toHaveBeenCalled();
  });
});
