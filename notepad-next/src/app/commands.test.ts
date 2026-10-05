import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";
import { DocumentManager } from "../docs/documentManager";
import { createMockIpc } from "../ipc";
import { DEFAULT_SETTINGS } from "../settings/model";
import { SettingsStore } from "../settings/store";
import { FindController } from "../search/findController";
import { MENU, createCommands, type Command } from "./commands";
import { dispatchShortcut, renderMenuBar } from "./menuBar";
import { createToaster } from "./toast";

let app: App;
let commands: Command[];
let openFind: ReturnType<typeof vi.fn<(tab: string) => void>>;
let notify: ReturnType<typeof vi.fn<(m: string, k: "info" | "error") => void>>;
let settingsIpc: ReturnType<typeof createMockIpc>;
const cmd = (id: string) => commands.find((c) => c.id === id)!;

beforeEach(async () => {
  document.body.innerHTML = '<nav id="menubar"></nav><div id="tabs"></div><div id="editor"></div><div id="status"></div>';
  settingsIpc = createMockIpc({ get_settings: () => ({ ...DEFAULT_SETTINGS }), update_settings: (a) => a?.settings });
  const settings = new SettingsStore(settingsIpc);
  await settings.load();
  notify = vi.fn();
  app = new App({
    editorParent: document.getElementById("editor")!,
    tabsEl: document.getElementById("tabs")!,
    statusEl: document.getElementById("status")!,
    manager: new DocumentManager(),
    platform: { pickOpenPath: vi.fn(), pickSavePath: vi.fn(async () => "/x.txt"), pickFolder: vi.fn(), confirmUnsaved: vi.fn(), confirm: vi.fn() },
    ipc: createMockIpc({ save_file_cmd: () => undefined }),
    settings,
    notify,
  });
  app.start();
  openFind = vi.fn();
  commands = createCommands({ app, finder: new FindController(app), settings, openFind, openSettings: vi.fn() });
});

describe("command registry", () => {
  it("defines every command id the menu refers to", () => {
    const ids = new Set(commands.map((c) => c.id));
    for (const menu of MENU) for (const id of menu.items) if (id !== "-") expect(ids.has(id), id).toBe(true);
  });

  it("has unique ids and no accelerator used twice", () => {
    expect(new Set(commands.map((c) => c.id)).size).toBe(commands.length);
    const accels = commands.filter((c) => c.accelerator).map((c) => c.accelerator);
    expect(new Set(accels).size).toBe(accels.length);
  });

  it("menus cover File, Edit, Search, View, Encoding, Language, JSON and Settings", () => {
    expect(MENU.map((m) => m.label)).toEqual(["File", "Edit", "Search", "View", "Encoding", "Language", "JSON", "Settings"]);
  });
});

describe("commands", () => {
  it("File > New adds a tab", () => {
    void cmd("file.new").run();
    expect(app.manager.docs.length).toBe(2);
  });

  it("Search commands open the Find dialog on the right tab", () => {
    void cmd("search.replace").run();
    void cmd("search.findInFiles").run();
    void cmd("search.mark").run();
    expect(openFind.mock.calls.map((c) => c[0])).toEqual(["replace", "files", "mark"]);
  });

  it("Encoding menu converts line endings and encoding of the active tab", () => {
    void cmd("eol.crlf").run();
    void cmd("enc.utf16le").run();
    expect(app.manager.active).toMatchObject({ eol: "crlf", encoding: "UTF-16LE", bom: true, dirty: true });
    expect(cmd("eol.crlf").checked!()).toBe(true);
    expect(cmd("eol.lf").checked!()).toBe(false);
    expect(cmd("enc.utf16le").checked!()).toBe(true);
    expect(cmd("enc.utf8").checked!()).toBe(false);
  });

  it("Language menu sets the language and reflects it as checked", () => {
    void cmd("lang.JSON").run();
    expect(app.manager.active!.language).toBe("JSON");
    expect(cmd("lang.JSON").checked!()).toBe(true);
    expect(cmd("lang.Normal text").checked!()).toBe(false);
  });

  it("JSON menu formats the document", () => {
    app.view.dispatch({ changes: { from: 0, insert: '{"a":1}' } });
    void cmd("json.pretty").run();
    expect(app.view.state.doc.toString()).toBe('{\n  "a": 1\n}');
    void cmd("json.minify").run();
    expect(app.view.state.doc.toString()).toBe('{"a":1}');
  });

  it("JSON validate reports through the notifier", () => {
    app.view.dispatch({ changes: { from: 0, insert: "{" } });
    void cmd("json.validate").run();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Line 1"), "error");
  });

  it("View toggles persist through settings", async () => {
    await cmd("view.wordWrap").run();
    expect(cmd("view.wordWrap").checked!()).toBe(true);
    expect(settingsIpc.calls[settingsIpc.calls.length - 1]).toMatchObject({ command: "update_settings", args: { settings: { wordWrap: true } } });
    await cmd("view.theme.dark").run();
    expect(cmd("view.theme.dark").checked!()).toBe(true);
  });

  it("Edit > Select All selects the document", () => {
    app.view.dispatch({ changes: { from: 0, insert: "hello" } });
    void cmd("edit.selectAll").run();
    expect(app.getSelection()).toEqual({ from: 0, to: 5 });
  });
});

describe("menu bar", () => {
  const nav = () => document.getElementById("menubar")!;
  const titles = () => [...nav().querySelectorAll(".menu-title")] as HTMLElement[];
  const title = (name: string) => titles().find((t) => t.textContent === name)!;

  it("renders a title for each menu", () => {
    renderMenuBar(nav(), commands);
    expect(titles().map((t) => t.textContent)).toEqual(MENU.map((m) => m.label));
  });

  it("opens a menu on click, lists its items with accelerators, and closes on a second click", () => {
    renderMenuBar(nav(), commands);
    title("File").click();
    const items = [...nav().querySelectorAll(".menu-item")];
    expect(items.map((i) => i.querySelector(".menu-label")!.textContent)).toEqual(["New", "Open…", "Open Folder…", "Save", "Save As…", "Close Tab"]);
    expect(items[3].querySelector("kbd")!.textContent).toMatch(/S$/);
    title("File").click();
    expect(nav().querySelector(".menu.open")).toBeNull();
  });

  it("runs the command and closes when an item is clicked", () => {
    renderMenuBar(nav(), commands);
    title("File").click();
    (nav().querySelector('[data-command="file.new"]') as HTMLElement).click();
    expect(app.manager.docs.length).toBe(2);
    expect(nav().querySelector(".menu.open")).toBeNull();
  });

  it("marks the active tab's line ending, encoding and language with a check", () => {
    renderMenuBar(nav(), commands);
    title("Encoding").click();
    expect(nav().querySelector('[data-command="eol.lf"]')!.getAttribute("aria-checked")).toBe("true");
    expect(nav().querySelector('[data-command="enc.utf8"]')!.getAttribute("aria-checked")).toBe("true");
    expect(nav().querySelector('[data-command="eol.crlf"]')!.getAttribute("aria-checked")).toBe("false");
  });

  it("switches menus on hover while one is open", () => {
    renderMenuBar(nav(), commands);
    title("File").click();
    title("Search").dispatchEvent(new MouseEvent("mouseenter"));
    expect(nav().querySelectorAll(".menu.open").length).toBe(1);
    expect(nav().querySelector(".menu.open .menu-title")!.textContent).toBe("Search");
  });

  it("does not open on hover when no menu is open", () => {
    renderMenuBar(nav(), commands);
    title("Search").dispatchEvent(new MouseEvent("mouseenter"));
    expect(nav().querySelector(".menu.open")).toBeNull();
  });

  it("closes on Escape and on an outside click", () => {
    renderMenuBar(nav(), commands);
    title("Edit").click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(nav().querySelector(".menu.open")).toBeNull();
    title("Edit").click();
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(nav().querySelector(".menu.open")).toBeNull();
  });

  it("lists every supported language in the Language menu", () => {
    renderMenuBar(nav(), commands);
    title("Language").click();
    const labels = [...nav().querySelectorAll(".menu-label")].map((l) => l.textContent);
    for (const l of ["Normal text", "JSON", "Rust", "TypeScript", "SQL"]) expect(labels).toContain(l);
  });
});

describe("keyboard shortcuts", () => {
  const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", { cancelable: true, ...init });

  it("runs the matching command and prevents the default", () => {
    const e = key({ key: "n", metaKey: true });
    expect(dispatchShortcut(e, commands)).toBe(true);
    expect(e.defaultPrevented).toBe(true);
    expect(app.manager.docs.length).toBe(2);
  });

  it("leaves native editing shortcuts to the editor", () => {
    const e = key({ key: "a", metaKey: true });
    expect(dispatchShortcut(e, commands)).toBe(false);
    expect(e.defaultPrevented).toBe(false);
  });

  it("ignores unrelated keys", () => {
    expect(dispatchShortcut(key({ key: "x" }), commands)).toBe(false);
  });

  it("Cmd+Shift+F opens Find in Files, not plain Find", () => {
    dispatchShortcut(key({ key: "F", metaKey: true, shiftKey: true }), commands);
    expect(openFind).toHaveBeenCalledWith("files");
  });

  it("F2 and Shift+F2 are bookmark navigation", () => {
    expect(dispatchShortcut(key({ key: "F2" }), commands)).toBe(true);
    expect(dispatchShortcut(key({ key: "F2", shiftKey: true }), commands)).toBe(true);
  });
});

describe("toast", () => {
  it("shows a message with its kind and hides it after the duration", () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    const toast = createToaster(el, 1000);
    toast("JSON is valid", "info");
    expect(el.textContent).toBe("JSON is valid");
    expect(el.className).toBe("toast info");
    expect(el.hidden).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(el.hidden).toBe(true);
    vi.useRealTimers();
  });

  it("a newer message replaces the old one and restarts the timer", () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    const toast = createToaster(el, 1000);
    toast("one", "info");
    vi.advanceTimersByTime(800);
    toast("two", "error");
    vi.advanceTimersByTime(800);
    expect(el.hidden).toBe(false);
    expect(el.className).toBe("toast error");
    vi.useRealTimers();
  });
});
