import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../app/app";
import { memoryClipboard } from "../app/clipboard";
import { DocumentManager } from "../docs/documentManager";
import { createMockIpc } from "../ipc";
import { DEFAULT_SETTINGS } from "../settings/model";
import { OpenRequestHandler, type OpenRequest, type OpenRequestHost } from "./openRequests";

interface FakeHost extends OpenRequestHost {
  send(req: OpenRequest): Promise<void>;
  calls: string[];
  handler: ((r: OpenRequest) => void | Promise<void>) | null;
}

let app: App;
let host: FakeHost;
let handler: OpenRequestHandler;
let files: Record<string, string>;
let confirm: ReturnType<typeof vi.fn<(message: string, okLabel: string) => Promise<boolean>>>;

const NOT_FOUND = "No such file or directory (os error 2)";

function makeHost(): FakeHost {
  const h: FakeHost = {
    calls: [],
    handler: null,
    async listen(fn) {
      h.handler = fn;
      return () => (h.handler = null);
    },
    async ready() {
      h.calls.push("ready");
    },
    async opened(id, error) {
      h.calls.push(error ? `opened:${id}:error:${error}` : `opened:${id}`);
    },
    async finish(id) {
      h.calls.push(`finish:${id}`);
    },
    async finishAll() {
      h.calls.push("finishAll");
    },
    async send(req) {
      await h.handler!(req);
    },
  };
  return h;
}

beforeEach(async () => {
  document.body.innerHTML = '<div id="tabs"></div><div id="editor"></div><div id="status"></div>';
  files = { "/work/a.txt": "aye", "/work/b.txt": "bee", "/work/c.json": "{}" };
  confirm = vi.fn(async () => true);
  app = new App({
    editorParent: document.getElementById("editor")!,
    tabsEl: document.getElementById("tabs")!,
    statusEl: document.getElementById("status")!,
    manager: new DocumentManager(),
    platform: { pickOpenPath: vi.fn(), pickSavePath: vi.fn(), pickFolder: vi.fn(), confirmUnsaved: vi.fn(), confirm, clipboard: memoryClipboard() },
    ipc: createMockIpc({
      open_file: (args) => {
        const p = String(args?.path);
        if (p === "/work/dir") throw new Error("/work/dir: Is a directory (os error 21)");
        if (!(p in files)) throw new Error(`${p}: ${NOT_FOUND}`);
        return { text: files[p], encoding: "UTF-8", bom: false, eol: "lf" };
      },
      file_size: (args) => (String(args?.path) === "/work/big.txt" ? 999_000_000 : files[String(args?.path)]?.length ?? 0),
    }),
    settings: { get: () => DEFAULT_SETTINGS, subscribe: () => () => {} },
  });
  app.start();
  host = makeHost();
  handler = new OpenRequestHandler(app, host);
  await handler.start();
});

const titles = () => app.manager.docs.map((d) => d.title);

describe("start", () => {
  it("registers the listener and only then tells the app it is ready", async () => {
    expect(host.handler).not.toBeNull();
    expect(host.calls).toEqual(["ready"]);
  });
});

describe("opening", () => {
  it("opens each path in a tab and answers ok", async () => {
    await host.send({ id: 1, paths: ["/work/a.txt", "/work/b.txt"], wait: false });
    expect(titles()).toEqual(expect.arrayContaining(["a.txt", "b.txt"]));
    expect(host.calls).toContain("opened:1");
    expect(host.calls.some((c) => c.startsWith("finish"))).toBe(false);
  });

  it("detects the language from the file name", async () => {
    await host.send({ id: 1, paths: ["/work/c.json"], wait: false });
    expect(app.manager.docs.find((d) => d.title === "c.json")!.language).toBe("JSON");
    // The grammar loads in the background; let it finish before the test (and its environment) ends.
    await app.languageReady();
  });

  it("focuses a file that is already open instead of opening it twice", async () => {
    await host.send({ id: 1, paths: ["/work/a.txt"], wait: false });
    await host.send({ id: 2, paths: ["/work/b.txt"], wait: false });
    const before = app.manager.docs.length;
    await host.send({ id: 3, paths: ["/work/a.txt"], wait: false });
    expect(app.manager.docs).toHaveLength(before);
    expect(app.manager.active!.title).toBe("a.txt");
  });

  it("opens a path that does not exist as an empty tab bound to it", async () => {
    await host.send({ id: 1, paths: ["/work/new.txt"], wait: false });
    const doc = app.manager.docs.find((d) => d.path === "/work/new.txt")!;
    expect(doc).toBeDefined();
    expect(doc.text).toBe("");
    expect(doc.dirty).toBe(false);
    expect(host.calls).toContain("opened:1");
  });

  it("reports a file that cannot be opened and stops there", async () => {
    await host.send({ id: 1, paths: ["/work/dir", "/work/b.txt"], wait: false });
    expect(host.calls.find((c) => c.startsWith("opened:1:error:"))).toMatch(/Is a directory/);
    expect(titles()).not.toContain("b.txt");
  });

  it("reports a large file the user declined", async () => {
    files["/work/big.txt"] = "x";
    confirm.mockResolvedValueOnce(false);
    await host.send({ id: 1, paths: ["/work/big.txt"], wait: false });
    expect(host.calls.find((c) => c.startsWith("opened:1:error:"))).toMatch(/big\.txt/);
  });
});

describe("waiting", () => {
  const closeTab = (title: string) => app.manager.close(app.manager.docs.find((d) => d.title === title)!.id);

  it("does not finish while the tab is open, and finishes when it closes", async () => {
    await host.send({ id: 1, paths: ["/work/a.txt"], wait: true });
    expect(host.calls).toContain("opened:1");
    expect(host.calls).not.toContain("finish:1");
    closeTab("a.txt");
    expect(host.calls).toContain("finish:1");
  });

  it("saving or editing the tab does not finish the wait", async () => {
    await host.send({ id: 1, paths: ["/work/a.txt"], wait: true });
    const id = app.manager.docs.find((d) => d.title === "a.txt")!.id;
    app.manager.setText(id, "changed");
    app.manager.markSaved(id);
    app.manager.activate(id);
    expect(host.calls).not.toContain("finish:1");
  });

  it("waits for every file of a request", async () => {
    await host.send({ id: 1, paths: ["/work/a.txt", "/work/b.txt"], wait: true });
    closeTab("a.txt");
    expect(host.calls).not.toContain("finish:1");
    closeTab("b.txt");
    expect(host.calls).toContain("finish:1");
  });

  it("waits on the existing tab of a file that was already open", async () => {
    await host.send({ id: 1, paths: ["/work/a.txt"], wait: false });
    await host.send({ id: 2, paths: ["/work/a.txt"], wait: true });
    expect(host.calls).not.toContain("finish:2");
    closeTab("a.txt");
    expect(host.calls).toContain("finish:2");
  });

  it("tracks several requests independently, and two requests on one file finish together", async () => {
    await host.send({ id: 1, paths: ["/work/a.txt"], wait: true });
    await host.send({ id: 2, paths: ["/work/b.txt"], wait: true });
    await host.send({ id: 3, paths: ["/work/b.txt"], wait: true });
    closeTab("b.txt");
    expect(host.calls).toEqual(expect.arrayContaining(["finish:2", "finish:3"]));
    expect(host.calls).not.toContain("finish:1");
  });

  it("finishes each request only once", async () => {
    await host.send({ id: 1, paths: ["/work/a.txt"], wait: true });
    closeTab("a.txt");
    app.newTab();
    app.newTab();
    expect(host.calls.filter((c) => c === "finish:1")).toHaveLength(1);
  });

  it("a missing file opened for waiting is waited on too", async () => {
    await host.send({ id: 1, paths: ["/work/new.txt"], wait: true });
    expect(host.calls).not.toContain("finish:1");
    closeTab("new.txt");
    expect(host.calls).toContain("finish:1");
  });

  it("a request that failed to open is never waited on", async () => {
    await host.send({ id: 1, paths: ["/work/dir"], wait: true });
    app.newTab();
    expect(host.calls.some((c) => c === "finish:1")).toBe(false);
  });

  it("finishAll tells the app every waiting request is done", async () => {
    await host.send({ id: 1, paths: ["/work/a.txt"], wait: true });
    await handler.finishAll();
    expect(host.calls).toContain("finishAll");
  });

  it("finishAll does nothing when nothing is waiting", async () => {
    await handler.finishAll();
    expect(host.calls).not.toContain("finishAll");
  });
});
