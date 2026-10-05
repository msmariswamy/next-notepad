import { memoryClipboard } from "../app/clipboard";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";
import { DocumentManager } from "../docs/documentManager";
import { createMockIpc } from "../ipc";
import { DEFAULT_SETTINGS } from "../settings/model";
import { SettingsStore } from "../settings/store";
import { FindController } from "../search/findController";
import { MENU, createCommands, menuIds, type Command } from "./commands";
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
    platform: { pickOpenPath: vi.fn(), pickSavePath: vi.fn(async () => "/x.txt"), pickFolder: vi.fn(), confirmUnsaved: vi.fn(), confirm: vi.fn(), clipboard: memoryClipboard() },
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
    for (const id of menuIds()) expect(ids.has(id), id).toBe(true);
  });

  it("has unique ids and no accelerator used twice", () => {
    expect(new Set(commands.map((c) => c.id)).size).toBe(commands.length);
    const accels = commands.filter((c) => c.accelerator).map((c) => c.accelerator);
    expect(new Set(accels).size).toBe(accels.length);
  });

  it("menus cover File, Edit, Search, View, Encoding, Language, JSON, Macro, Settings and Help", () => {
    expect(MENU.map((m) => m.label)).toEqual(["File", "Edit", "Search", "View", "Encoding", "Language", "JSON", "Macro", "Settings", "Help"]);
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

  it("View > Function List and Document Map are checkable, default off, and persist through settings", async () => {
    expect([cmd("view.functionList").checked!(), cmd("view.documentMap").checked!()]).toEqual([false, false]);
    await cmd("view.functionList").run();
    expect(cmd("view.functionList").checked!()).toBe(true);
    expect(settingsIpc.calls[settingsIpc.calls.length - 1]).toMatchObject({ command: "update_settings", args: { settings: { showFunctionList: true } } });
    await cmd("view.documentMap").run();
    expect(cmd("view.documentMap").checked!()).toBe(true);
    await cmd("view.functionList").run();
    expect(cmd("view.functionList").checked!()).toBe(false);
  });

  it("View has the four split commands, which are harmless without a second pane", () => {
    const ids = ["view.splitVertical", "view.splitHorizontal", "view.closeSplit", "view.moveToOtherPane"];
    for (const id of ids) {
      expect(cmd(id), id).toBeDefined();
      expect(() => cmd(id).run()).not.toThrow();
    }
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

  it("stops propagation so the editor's own keymap does not also run it", () => {
    const e = key({ key: "n", metaKey: true });
    const stop = vi.spyOn(e, "stopPropagation");
    dispatchShortcut(e, commands);
    expect(stop).toHaveBeenCalled();
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

describe("Edit and Search submenus (Notepad++ layout)", () => {
  const nav = () => document.getElementById("menubar")!;
  const title = (name: string) => [...nav().querySelectorAll(".menu-title")].find((t) => t.textContent === name) as HTMLElement;
  const submenu = (name: string) => nav().querySelector(`[data-submenu="${name}"]`) as HTMLElement;

  it("Edit lists clipboard commands and the six submenus", () => {
    renderMenuBar(nav(), commands);
    title("Edit").click();
    const top = [...nav().querySelector(".menu.open .menu-dropdown")!.children]
      .filter((c) => c.classList.contains("menu-item") || c.classList.contains("menu-submenu"))
      .map((c) => (c.querySelector(".menu-label") as HTMLElement).textContent);
    expect(top).toEqual(["Undo", "Redo", "Cut", "Copy", "Paste", "Delete", "Select All", "Convert Case to", "Line Operations", "Blank Operations", "Indent", "Comment/Uncomment", "Base64", "Format Document"]);
  });

  it("hovering a submenu opens it to the side and lists its commands", () => {
    renderMenuBar(nav(), commands);
    title("Edit").click();
    submenu("Convert Case to").dispatchEvent(new MouseEvent("mouseenter"));
    const labels = [...submenu("Convert Case to").parentElement!.querySelectorAll(".menu-nested .menu-label")].map((l) => l.textContent);
    expect(labels).toEqual(["UPPERCASE", "lowercase", "Proper Case", "Proper Case (blend)", "Sentence case", "Sentence case (blend)", "iNVERT cASE", "ranDOm CasE"]);
  });

  it("Line Operations has every operation and all fourteen sort commands", () => {
    renderMenuBar(nav(), commands);
    title("Edit").click();
    submenu("Line Operations").dispatchEvent(new MouseEvent("mouseenter"));
    const labels = [...submenu("Line Operations").parentElement!.querySelectorAll(".menu-nested .menu-label")].map((l) => l.textContent!);
    for (const l of ["Duplicate Current Line", "Remove Duplicate Lines", "Remove Consecutive Duplicate Lines", "Split Lines", "Join Lines", "Move Up Current Line", "Move Down Current Line", "Remove Empty Lines", "Remove Empty Lines (Containing Blank characters)", "Insert Blank Line Above Current", "Insert Blank Line Below Current", "Reverse Line Order", "Randomize Line Order"]) {
      expect(labels).toContain(l);
    }
    expect(labels.filter((l) => l.startsWith("Sort Lines")).length).toBe(14);
    expect(labels).toContain("Sort Lines As Decimals (Comma) Descending");
  });

  it("Blank Operations lists the eight blank commands", () => {
    renderMenuBar(nav(), commands);
    title("Edit").click();
    submenu("Blank Operations").dispatchEvent(new MouseEvent("mouseenter"));
    const labels = [...submenu("Blank Operations").parentElement!.querySelectorAll(".menu-nested .menu-label")].map((l) => l.textContent);
    expect(labels).toEqual(["Trim Trailing Space", "Trim Leading Space", "Trim Leading and Trailing Space", "EOL to Space", "Trim both and EOL to Space", "TAB to Space", "Space to TAB (All)", "Space to TAB (Leading)"]);
  });

  it("Search > Bookmark lists the bookmarked-line commands", () => {
    renderMenuBar(nav(), commands);
    title("Search").click();
    submenu("Bookmark").dispatchEvent(new MouseEvent("mouseenter"));
    const labels = [...submenu("Bookmark").parentElement!.querySelectorAll(".menu-nested .menu-label")].map((l) => l.textContent);
    expect(labels).toEqual(["Toggle Bookmark", "Next Bookmark", "Previous Bookmark", "Clear All Bookmarks", "Cut Bookmarked Lines", "Copy Bookmarked Lines", "Paste to (Replace) Bookmarked Lines", "Remove Bookmarked Lines", "Remove Non-Bookmarked Lines", "Inverse Bookmarks"]);
  });

  it("running a submenu item executes it and closes the whole menu", () => {
    app.view.dispatch({ changes: { from: 0, insert: "b\na\nb" } });
    renderMenuBar(nav(), commands);
    title("Edit").click();
    submenu("Line Operations").dispatchEvent(new MouseEvent("mouseenter"));
    (nav().querySelector('[data-command="line.removeDuplicates"]') as HTMLElement).click();
    expect(app.view.state.doc.toString()).toBe("b\na");
    expect(nav().querySelector(".menu.open")).toBeNull();
  });

  it("opening one submenu closes its sibling", () => {
    renderMenuBar(nav(), commands);
    title("Edit").click();
    submenu("Convert Case to").dispatchEvent(new MouseEvent("mouseenter"));
    submenu("Blank Operations").dispatchEvent(new MouseEvent("mouseenter"));
    const open = [...nav().querySelectorAll(".menu-nested")].filter((n) => !(n as HTMLElement).hidden);
    expect(open.length).toBe(1);
  });

  it("View has Word Wrap, Show Whitespace and Show All Characters", () => {
    renderMenuBar(nav(), commands);
    title("View").click();
    const labels = [...nav().querySelectorAll(".menu.open .menu-label")].map((l) => l.textContent);
    expect(labels.slice(0, 3)).toEqual(["Word Wrap", "Show Whitespace", "Show All Characters"]);
  });
});

describe("Help menu", () => {
  it("About opens a dialog crediting the author", () => {
    void cmd("help.about").run();
    expect(document.querySelector('[data-testid="about-dialog"]')!.textContent).toContain("Mariswamy Pillai");
  });
});

describe("Edit commands via the registry", () => {
  it("Convert Case > UPPERCASE with a shortcut", () => {
    app.view.dispatch({ changes: { from: 0, insert: "abc" }, selection: { anchor: 0, head: 3 } });
    dispatchShortcut(new KeyboardEvent("keydown", { key: "U", metaKey: true, shiftKey: true, cancelable: true }), commands);
    expect(app.view.state.doc.toString()).toBe("ABC");
  });

  it("Show All Characters toggles through settings and is checked", async () => {
    await cmd("view.showAllCharacters").run();
    expect(cmd("view.showAllCharacters").checked!()).toBe(true);
  });

  it("Delete removes the character after the caret", () => {
    app.view.dispatch({ changes: { from: 0, insert: "abc" }, selection: { anchor: 1 } });
    void cmd("edit.delete").run();
    expect(app.view.state.doc.toString()).toBe("ac");
  });

  it("Cut and Paste go through the clipboard", async () => {
    app.view.dispatch({ changes: { from: 0, insert: "hello" }, selection: { anchor: 0, head: 5 } });
    await cmd("edit.cut").run();
    expect(app.view.state.doc.toString()).toBe("");
    await cmd("edit.paste").run();
    expect(app.view.state.doc.toString()).toBe("hello");
  });

  it("Copy leaves the text in place", async () => {
    app.view.dispatch({ changes: { from: 0, insert: "hi" }, selection: { anchor: 0, head: 2 } });
    await cmd("edit.copy").run();
    expect(app.view.state.doc.toString()).toBe("hi");
  });
});
