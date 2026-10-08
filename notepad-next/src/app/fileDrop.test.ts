import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";
import { memoryClipboard } from "./clipboard";
import { DocumentManager } from "../docs/documentManager";
import { createMockIpc } from "../ipc";
import { DEFAULT_SETTINGS } from "../settings/model";
import { createFileDropHandler } from "./fileDrop";

let app: App;
let notify: ReturnType<typeof vi.fn<(m: string, k: "info" | "error") => void>>;
let confirm: ReturnType<typeof vi.fn<(message: string, okLabel: string) => Promise<boolean>>>;
let files: Record<string, string>;

beforeEach(() => {
  document.body.innerHTML = '<div id="tabs"></div><div id="editor"></div><div id="status"></div>';
  files = { "/work/a.txt": "aye", "/work/b.txt": "bee", "/work/c.txt": "sea", "/work/config.json": "{}" };
  notify = vi.fn();
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
        if (p === "/work/app") throw new Error("/work/app: Is a directory (os error 21)");
        if (!(p in files)) throw new Error(`${p}: No such file or directory (os error 2)`);
        return { text: files[p], encoding: "UTF-8", bom: false, eol: "lf" };
      },
      file_size: (args) => (String(args?.path) === "/work/big.log" ? 999_000_000 : files[String(args?.path)]?.length ?? 0),
    }),
    settings: { get: () => DEFAULT_SETTINGS, subscribe: () => () => {} },
    notify,
  });
  app.start();
  files["/work/big.log"] = "huge";
});

const titles = () => app.manager.docs.map((d) => d.title);
const drop = (paths: string[]) => createFileDropHandler(app)(paths);

describe("opening dropped files", () => {
  it("opens one file and makes it active", async () => {
    await drop(["/work/a.txt"]);
    expect(app.manager.active!.title).toBe("a.txt");
  });

  it("opens several files in drop order and activates the last", async () => {
    await drop(["/work/a.txt", "/work/b.txt", "/work/c.txt"]);
    expect(titles()).toEqual(expect.arrayContaining(["a.txt", "b.txt", "c.txt"]));
    const order = titles().filter((t) => t.endsWith(".txt") && t !== "new 1");
    expect(order).toEqual(["a.txt", "b.txt", "c.txt"]);
    expect(app.manager.active!.title).toBe("c.txt");
  });

  it("detects the language from the file name", async () => {
    await drop(["/work/config.json"]);
    expect(app.manager.active!.language).toBe("JSON");
    await app.languageReady();
  });

  it("focuses a file that is already open instead of opening it twice", async () => {
    await drop(["/work/a.txt", "/work/b.txt"]);
    const count = app.manager.docs.length;
    await drop(["/work/a.txt"]);
    expect(app.manager.docs).toHaveLength(count);
    expect(app.manager.active!.title).toBe("a.txt");
  });

  it("opens one tab when the same file is dropped twice in one drop", async () => {
    await drop(["/work/a.txt", "/work/a.txt"]);
    expect(titles().filter((t) => t === "a.txt")).toHaveLength(1);
  });

  it("does nothing for an empty drop", async () => {
    const before = titles();
    await drop([]);
    expect(titles()).toEqual(before);
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("errors", () => {
  it("reports a folder with the path and the reason and opens no tab for it", async () => {
    await drop(["/work/app"]);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("cannot open /work/app: Is a directory (os error 21)", "error");
    expect(app.manager.docs.some((d) => d.path === "/work/app")).toBe(false);
  });

  it("keeps opening the other files after a failure and activates the last one that opened", async () => {
    await drop(["/work/a.txt", "/work/app", "/work/b.txt"]);
    expect(titles()).toEqual(expect.arrayContaining(["a.txt", "b.txt"]));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(app.manager.active!.title).toBe("b.txt");
  });

  it("reports a missing file", async () => {
    await drop(["/work/gone.txt"]);
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/^cannot open \/work\/gone\.txt: No such file/), "error");
  });

  it("a drop of only failures leaves the active tab alone", async () => {
    await drop(["/work/a.txt"]);
    const active = app.manager.activeId;
    await drop(["/work/app", "/work/gone.txt"]);
    expect(app.manager.activeId).toBe(active);
    expect(notify).toHaveBeenCalledTimes(2);
  });
});

describe("large files", () => {
  it("opens a large file the user confirms", async () => {
    await drop(["/work/big.log"]);
    expect(confirm).toHaveBeenCalled();
    expect(app.manager.active!.title).toBe("big.log");
  });

  it("skips a large file the user declines, without an error, and opens the rest", async () => {
    confirm.mockResolvedValueOnce(false);
    await drop(["/work/a.txt", "/work/big.log"]);
    expect(titles()).toContain("a.txt");
    expect(titles()).not.toContain("big.log");
    expect(notify).not.toHaveBeenCalled();
    expect(app.manager.active!.title).toBe("a.txt");
  });
});

describe("focus", () => {
  it("returns focus to the editor after something opened", async () => {
    const focus = vi.spyOn(app.view, "focus");
    await drop(["/work/a.txt"]);
    expect(focus).toHaveBeenCalled();
  });

  it("does not steal focus when nothing opened", async () => {
    const focus = vi.spyOn(app.view, "focus");
    await drop(["/work/app"]);
    expect(focus).not.toHaveBeenCalled();
  });
});

describe("overlapping drops", () => {
  it("handles one drop after the other so large-file prompts do not stack", async () => {
    let release: (v: boolean) => void = () => {};
    confirm.mockImplementationOnce(() => new Promise<boolean>((r) => (release = r)));
    const handler = createFileDropHandler(app);
    const first = handler(["/work/big.log"]);
    const second = handler(["/work/b.txt"]);
    await new Promise((r) => setTimeout(r, 20));
    expect(titles()).not.toContain("b.txt");
    release(true);
    await Promise.all([first, second]);
    expect(app.manager.active!.title).toBe("b.txt");
    expect(titles()).toEqual(expect.arrayContaining(["big.log", "b.txt"]));
  });
});
