import { redo, selectAll, undo } from "@codemirror/commands";
import type { App } from "./app";
import { LANGUAGES } from "../lang/languages";
import { runJsonCommand } from "../json/jsonCommands";
import type { FindController } from "../search/findController";
import type { FindTab } from "../search/findDialog";
import type { SettingsStore } from "../settings/store";
import type { Theme } from "../settings/model";

export interface Command {
  id: string;
  label: string;
  accelerator?: string;
  /** Handled natively by the editor (undo, select all, ...): shown in the menu but not intercepted. */
  native?: boolean;
  run(): void | Promise<void>;
  checked?(): boolean;
}

export interface CommandContext {
  app: App;
  finder: FindController;
  settings: SettingsStore;
  openFind(tab: FindTab): void;
  openSettings(): void;
}

const ENCODINGS: { id: string; label: string; encoding: string; bom: boolean }[] = [
  { id: "enc.utf8", label: "UTF-8", encoding: "UTF-8", bom: false },
  { id: "enc.utf8bom", label: "UTF-8 with BOM", encoding: "UTF-8", bom: true },
  { id: "enc.utf16le", label: "UTF-16 LE BOM", encoding: "UTF-16LE", bom: true },
  { id: "enc.utf16be", label: "UTF-16 BE BOM", encoding: "UTF-16BE", bom: true },
  { id: "enc.ansi", label: "ANSI (Windows-1252)", encoding: "windows-1252", bom: false },
];

/** An invalid regex in a shortcut-triggered search is reported by the dialog; ignore it here. */
const quietly = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
  }
};

export function createCommands(ctx: CommandContext): Command[] {
  const { app, finder, settings } = ctx;
  const doc = () => app.manager.active;
  const activeId = () => app.manager.activeId;
  const toggle = (key: "wordWrap" | "showWhitespace") => () => void settings.update({ [key]: !settings.get()[key] });

  return [
    // File
    { id: "file.new", label: "New", accelerator: "Mod+N", run: () => app.newTab() },
    { id: "file.open", label: "Open…", accelerator: "Mod+O", run: () => app.openFileDialog() },
    { id: "file.openFolder", label: "Open Folder…", run: async () => void (await app.openFolder()) },
    { id: "file.save", label: "Save", accelerator: "Mod+S", run: async () => void (await app.save()) },
    { id: "file.saveAs", label: "Save As…", accelerator: "Mod+Shift+S", run: async () => void (await app.saveAs()) },
    { id: "file.closeTab", label: "Close Tab", accelerator: "Mod+W", run: () => (activeId() ? app.closeTab(activeId()!) : undefined) },
    // Edit
    { id: "edit.undo", label: "Undo", accelerator: "Mod+Z", native: true, run: () => void undo(app.view) },
    { id: "edit.redo", label: "Redo", accelerator: "Mod+Shift+Z", native: true, run: () => void redo(app.view) },
    { id: "edit.selectAll", label: "Select All", accelerator: "Mod+A", native: true, run: () => void selectAll(app.view) },
    // Search
    { id: "search.find", label: "Find…", accelerator: "Mod+F", run: () => ctx.openFind("find") },
    { id: "search.replace", label: "Replace…", accelerator: "Mod+H", run: () => ctx.openFind("replace") },
    { id: "search.findInFiles", label: "Find in Files…", accelerator: "Mod+Shift+F", run: () => ctx.openFind("files") },
    { id: "search.findInProjects", label: "Find in Projects…", run: () => ctx.openFind("projects") },
    { id: "search.mark", label: "Mark…", run: () => ctx.openFind("mark") },
    { id: "search.findNext", label: "Find Next", accelerator: "Mod+G", run: () => quietly(() => finder.findNext({ backward: false })) },
    { id: "search.findPrev", label: "Find Previous", accelerator: "Mod+Shift+G", run: () => quietly(() => finder.findNext({ backward: true })) },
    { id: "bookmark.toggle", label: "Toggle Bookmark", accelerator: "Mod+F2", run: () => finder.toggleBookmarkAtCaret() },
    { id: "bookmark.next", label: "Next Bookmark", accelerator: "F2", run: () => void finder.gotoBookmark(false) },
    { id: "bookmark.prev", label: "Previous Bookmark", accelerator: "Shift+F2", run: () => void finder.gotoBookmark(true) },
    { id: "bookmark.clear", label: "Clear All Bookmarks", run: () => finder.clearBookmarks() },
    { id: "marks.clear", label: "Clear All Marks", run: () => finder.clearMarks() },
    // View
    { id: "view.wordWrap", label: "Word Wrap", run: toggle("wordWrap"), checked: () => settings.get().wordWrap },
    { id: "view.showWhitespace", label: "Show Whitespace", run: toggle("showWhitespace"), checked: () => settings.get().showWhitespace },
    ...(["system", "light", "dark"] as Theme[]).map((t) => ({
      id: `view.theme.${t}`,
      label: `Theme: ${t[0].toUpperCase()}${t.slice(1)}`,
      run: () => void settings.update({ theme: t }),
      checked: () => settings.get().theme === t,
    })),
    // Encoding
    { id: "eol.lf", label: "Unix (LF)", run: () => app.setEol("lf"), checked: () => doc()?.eol === "lf" },
    { id: "eol.crlf", label: "Windows (CR LF)", run: () => app.setEol("crlf"), checked: () => doc()?.eol === "crlf" },
    { id: "eol.cr", label: "Old Mac (CR)", run: () => app.setEol("cr"), checked: () => doc()?.eol === "cr" },
    ...ENCODINGS.map((e) => ({
      id: e.id,
      label: e.label,
      run: () => app.setEncoding(e.encoding, e.bom),
      checked: () => doc()?.encoding.toLowerCase() === e.encoding.toLowerCase() && doc()?.bom === e.bom,
    })),
    // Language
    ...LANGUAGES.map((l) => ({
      id: `lang.${l.name}`,
      label: l.name,
      run: () => app.setLanguage(l.name),
      checked: () => doc()?.language === l.name,
    })),
    // JSON
    { id: "json.pretty", label: "Pretty-print", accelerator: "Mod+Alt+J", run: () => void runJsonCommand(app, "pretty") },
    { id: "json.minify", label: "Minify", accelerator: "Mod+Alt+Shift+J", run: () => void runJsonCommand(app, "minify") },
    { id: "json.validate", label: "Validate", accelerator: "Mod+Alt+V", run: () => void runJsonCommand(app, "validate") },
    // Settings
    { id: "settings.open", label: "Preferences…", accelerator: "Mod+,", run: () => ctx.openSettings() },
  ];
}

export interface MenuModel {
  label: string;
  items: (string | "-")[];
}

export const MENU: MenuModel[] = [
  { label: "File", items: ["file.new", "file.open", "file.openFolder", "-", "file.save", "file.saveAs", "-", "file.closeTab"] },
  { label: "Edit", items: ["edit.undo", "edit.redo", "-", "edit.selectAll"] },
  {
    label: "Search",
    items: ["search.find", "search.replace", "search.findInFiles", "search.findInProjects", "search.mark", "-", "search.findNext", "search.findPrev", "-", "bookmark.toggle", "bookmark.next", "bookmark.prev", "bookmark.clear", "marks.clear"],
  },
  { label: "View", items: ["view.wordWrap", "view.showWhitespace", "-", "view.theme.system", "view.theme.light", "view.theme.dark"] },
  { label: "Encoding", items: ["eol.lf", "eol.crlf", "eol.cr", "-", ...ENCODINGS.map((e) => e.id)] },
  { label: "Language", items: LANGUAGES.map((l) => `lang.${l.name}`) },
  { label: "JSON", items: ["json.pretty", "json.minify", "json.validate"] },
  { label: "Settings", items: ["settings.open"] },
];
