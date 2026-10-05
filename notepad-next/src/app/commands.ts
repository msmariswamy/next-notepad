import { deleteCharForward, redo, selectAll, undo } from "@codemirror/commands";
import { BookmarkOps } from "../edit/bookmarkOps";
import { EditOps } from "../edit/editOps";
import type { CaseMode, SortKind } from "../edit/transforms";
import type { App } from "./app";
import { LANGUAGES } from "../lang/languages";
import { runBase64Command } from "../edit/base64Commands";
import { dataToolCommands } from "../tools/dataCommands";
import { runJsonCommand } from "../json/jsonCommands";
import { runFormatDocument } from "../format/formatCommand";
import { openAboutDialog } from "./about";
import type { FindController } from "../search/findController";
import type { FindTab } from "../search/findDialog";
import type { SettingsStore } from "../settings/store";
import type { SplitView } from "../split/splitView";
import type { MacroController } from "../macro/controller";
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
  /** Split view controller; absent in contexts that have no second pane (some tests). */
  split?: SplitView;
  /** Opens Help > Command Line Tool…; absent in contexts without it (some tests). */
  openCommandLine?: () => void;
  /** Macro controller; absent in contexts without macro support (some tests). */
  macros?: MacroController;
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

const CASES: { id: string; label: string; mode: CaseMode; accelerator?: string }[] = [
  { id: "case.upper", label: "UPPERCASE", mode: "upper", accelerator: "Mod+Shift+U" },
  { id: "case.lower", label: "lowercase", mode: "lower", accelerator: "Mod+U" },
  { id: "case.proper", label: "Proper Case", mode: "proper" },
  { id: "case.properBlend", label: "Proper Case (blend)", mode: "properBlend" },
  { id: "case.sentence", label: "Sentence case", mode: "sentence" },
  { id: "case.sentenceBlend", label: "Sentence case (blend)", mode: "sentenceBlend" },
  { id: "case.invert", label: "iNVERT cASE", mode: "invert" },
  { id: "case.random", label: "ranDOm CasE", mode: "random" },
];

const SORTS: { kind: SortKind; label: string }[] = [
  { kind: "lex", label: "Lexicographically" },
  { kind: "lexIgnoreCase", label: "Lex. Ignoring Case" },
  { kind: "locale", label: "In Locale Order" },
  { kind: "integer", label: "As Integers" },
  { kind: "decimalComma", label: "As Decimals (Comma)" },
  { kind: "decimalDot", label: "As Decimals (Dot)" },
  { kind: "length", label: "By Length" },
];

export function createCommands(ctx: CommandContext): Command[] {
  const { app, finder, settings } = ctx;
  const edit = new EditOps(app, () => settings.get().tabWidth);
  const bookmarks = new BookmarkOps(app);
  const clip = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      app.notify(`Clipboard unavailable: ${e}`, "error");
    }
  };
  const selectedText = () => app.view.state.sliceDoc(app.getSelection().from, app.getSelection().to);
  const doc = () => app.manager.active;
  const activeId = () => app.manager.activeId;
  const toggle = (key: "wordWrap" | "showWhitespace" | "showAllCharacters" | "showFunctionList" | "showDocumentMap") => () => void settings.update({ [key]: !settings.get()[key] });

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
    {
      id: "edit.cut",
      label: "Cut",
      accelerator: "Mod+X",
      native: true,
      run: () => clip(async () => {
        const text = selectedText();
        if (!text) return;
        await app.clipboard.writeText(text);
        app.view.dispatch(app.view.state.replaceSelection(""));
      }),
    },
    { id: "edit.copy", label: "Copy", accelerator: "Mod+C", native: true, run: () => clip(async () => void (selectedText() && (await app.clipboard.writeText(selectedText())))) },
    {
      id: "edit.paste",
      label: "Paste",
      accelerator: "Mod+V",
      native: true,
      run: () => clip(async () => app.view.dispatch(app.view.state.replaceSelection((await app.clipboard.readText()).replace(/\r\n?/g, "\n")))),
    },
    { id: "edit.delete", label: "Delete", native: true, run: () => void deleteCharForward(app.view) },
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
    { id: "bm.cut", label: "Cut Bookmarked Lines", run: () => void bookmarks.cut() },
    { id: "bm.copy", label: "Copy Bookmarked Lines", run: () => void bookmarks.copy() },
    { id: "bm.paste", label: "Paste to (Replace) Bookmarked Lines", run: () => void bookmarks.pasteReplace() },
    { id: "bm.remove", label: "Remove Bookmarked Lines", run: () => void bookmarks.removeBookmarked() },
    { id: "bm.removeNon", label: "Remove Non-Bookmarked Lines", run: () => void bookmarks.removeNonBookmarked() },
    { id: "bm.inverse", label: "Inverse Bookmarks", run: () => bookmarks.inverse() },
    { id: "marks.clear", label: "Clear All Marks", run: () => finder.clearMarks() },
    // Edit: Convert Case, Line Operations, Blank Operations, Indent, Comment
    ...CASES.map((c) => ({ id: c.id, label: c.label, accelerator: c.accelerator, run: () => void edit.convertCase(c.mode) })),
    { id: "line.duplicate", label: "Duplicate Current Line", accelerator: "Mod+Shift+D", run: () => void edit.duplicateLine() },
    { id: "line.removeDuplicates", label: "Remove Duplicate Lines", run: () => void edit.removeDuplicateLines() },
    { id: "line.removeConsecutive", label: "Remove Consecutive Duplicate Lines", run: () => void edit.removeConsecutiveDuplicateLines() },
    { id: "line.split", label: "Split Lines", run: () => void edit.splitLines() },
    { id: "line.join", label: "Join Lines", accelerator: "Mod+J", run: () => void edit.joinLines() },
    { id: "line.moveUp", label: "Move Up Current Line", accelerator: "Alt+ArrowUp", native: true, run: () => void edit.moveLineUp() },
    { id: "line.moveDown", label: "Move Down Current Line", accelerator: "Alt+ArrowDown", native: true, run: () => void edit.moveLineDown() },
    { id: "line.removeEmpty", label: "Remove Empty Lines", run: () => void edit.removeEmptyLines() },
    { id: "line.removeEmptyBlank", label: "Remove Empty Lines (Containing Blank characters)", run: () => void edit.removeEmptyLinesWithBlanks() },
    { id: "line.insertAbove", label: "Insert Blank Line Above Current", accelerator: "Mod+Alt+Enter", run: () => void edit.insertBlankLine("above") },
    { id: "line.insertBelow", label: "Insert Blank Line Below Current", accelerator: "Mod+Alt+Shift+Enter", run: () => void edit.insertBlankLine("below") },
    { id: "line.reverse", label: "Reverse Line Order", run: () => void edit.reverseLines() },
    { id: "line.randomize", label: "Randomize Line Order", run: () => void edit.randomizeLines() },
    ...SORTS.flatMap((x) =>
      (["asc", "desc"] as const).map((dir) => ({
        id: `sort.${x.kind}.${dir}`,
        label: `Sort Lines ${x.label} ${dir === "asc" ? "Ascending" : "Descending"}`,
        run: () => void edit.sort(x.kind, dir),
      })),
    ),
    { id: "blank.trimTrailing", label: "Trim Trailing Space", run: () => void edit.trimTrailing() },
    { id: "blank.trimLeading", label: "Trim Leading Space", run: () => void edit.trimLeading() },
    { id: "blank.trimBoth", label: "Trim Leading and Trailing Space", run: () => void edit.trimBoth() },
    { id: "blank.eolToSpace", label: "EOL to Space", run: () => void edit.eolToSpace() },
    { id: "blank.trimBothEol", label: "Trim both and EOL to Space", run: () => void edit.trimBothAndEol() },
    { id: "blank.tabToSpace", label: "TAB to Space", run: () => void edit.tabToSpace() },
    { id: "blank.spaceToTabAll", label: "Space to TAB (All)", run: () => void edit.spaceToTabAll() },
    { id: "blank.spaceToTabLeading", label: "Space to TAB (Leading)", run: () => void edit.spaceToTabLeading() },
    { id: "indent.more", label: "Indent", accelerator: "Mod+]", run: () => void edit.indent() },
    { id: "indent.less", label: "Outdent", accelerator: "Mod+[", run: () => void edit.outdent() },
    { id: "comment.line", label: "Toggle Single Line Comment", accelerator: "Mod+/", run: () => void edit.toggleLineComment() },
    { id: "comment.block", label: "Toggle Block Comment", run: () => void edit.toggleBlockComment() },
    // Edit: Base64
    { id: "base64.encode", label: "Base64 Encode", run: () => void runBase64Command(app, "encode") },
    { id: "base64.decode", label: "Base64 Decode", run: () => void runBase64Command(app, "decode") },
    { id: "base64.encodeUrl", label: "Base64 Encode (URL-safe)", run: () => void runBase64Command(app, "encodeUrl") },
    { id: "base64.decodeUrl", label: "Base64 Decode (URL-safe)", run: () => void runBase64Command(app, "decodeUrl") },
    // View
    { id: "view.wordWrap", label: "Word Wrap", run: toggle("wordWrap"), checked: () => settings.get().wordWrap },
    { id: "view.showWhitespace", label: "Show Whitespace", run: toggle("showWhitespace"), checked: () => settings.get().showWhitespace },
    { id: "view.showAllCharacters", label: "Show All Characters", run: toggle("showAllCharacters"), checked: () => settings.get().showAllCharacters },
    { id: "view.functionList", label: "Function List", run: toggle("showFunctionList"), checked: () => settings.get().showFunctionList },
    { id: "view.documentMap", label: "Document Map", run: toggle("showDocumentMap"), checked: () => settings.get().showDocumentMap },
    { id: "view.splitVertical", label: "Split Vertically", run: () => ctx.split?.open("vertical") },
    { id: "view.splitHorizontal", label: "Split Horizontally", run: () => ctx.split?.open("horizontal") },
    { id: "view.closeSplit", label: "Close Split", run: () => ctx.split?.close() },
    { id: "view.moveToOtherPane", label: "Move to Other Pane", run: () => ctx.split?.moveToOtherPane() },
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
    // Format
    { id: "format.document", label: "Format Document", accelerator: "Mod+Alt+L", run: async () => void (await runFormatDocument(app, { tabWidth: settings.get().tabWidth, useTabs: settings.get().useTabs })) },
    // JSON
    { id: "json.pretty", label: "Pretty-print (2 spaces)", accelerator: "Mod+Alt+J", run: () => void runJsonCommand(app, "pretty") },
    { id: "json.pretty4", label: "Pretty-print (4 spaces)", run: () => void runJsonCommand(app, "pretty4") },
    { id: "json.prettyTabs", label: "Pretty-print (tabs)", run: () => void runJsonCommand(app, "prettyTabs") },
    { id: "json.minify", label: "Compress (minify)", accelerator: "Mod+Alt+Shift+J", run: () => void runJsonCommand(app, "minify") },
    { id: "json.sortKeys", label: "Sort Keys", run: () => void runJsonCommand(app, "sortKeys") },
    { id: "json.escape", label: "Escape as JSON String", run: () => void runJsonCommand(app, "escape") },
    { id: "json.unescape", label: "Unescape JSON String", run: () => void runJsonCommand(app, "unescape") },
    { id: "json.validate", label: "Validate", accelerator: "Mod+Alt+V", run: () => void runJsonCommand(app, "validate") },
    // XML, YAML and Convert
    ...dataToolCommands(app),
    // Macro
    { id: "macro.startRecording", label: "Start Recording", run: () => ctx.macros?.startRecording() },
    { id: "macro.stopRecording", label: "Stop Recording", run: () => ctx.macros?.stopRecording() },
    { id: "macro.playback", label: "Playback", run: () => ctx.macros?.playback() },
    { id: "macro.runMultiple", label: "Run a Macro Multiple Times…", run: () => ctx.macros?.runMultiple() },
    { id: "macro.saveAs", label: "Save Current Recorded Macro…", run: () => ctx.macros?.saveAs() },
    { id: "macro.manage", label: "Manage Saved Macros…", run: () => ctx.macros?.manage() },
    { id: "macro.none", label: "(no saved macros)", run: () => {} },
    // Help
    { id: "help.commandLine", label: "Command Line Tool…", run: () => ctx.openCommandLine?.() },
    { id: "help.about", label: "About next-notepad", run: () => void openAboutDialog() },
    // Settings
    { id: "settings.open", label: "Preferences…", accelerator: "Mod+,", run: () => ctx.openSettings() },
  ];
}

export type MenuItem = string | "-" | { label: string; items: MenuItem[] };

export interface MenuModel {
  label: string;
  items: MenuItem[];
}

const sorts = (dir: "asc" | "desc") => SORTS.map((x) => `sort.${x.kind}.${dir}`);

/** The menu bar layout. Saved macros are dynamic, so the Macro menu lists them from `savedMacroIds`. */
export function buildMenu(savedMacroIds: string[] = []): MenuModel[] {
  return [
  { label: "File", items: ["file.new", "file.open", "file.openFolder", "-", "file.save", "file.saveAs", "-", "file.closeTab"] },
  {
    label: "Edit",
    items: [
      "edit.undo",
      "edit.redo",
      "-",
      "edit.cut",
      "edit.copy",
      "edit.paste",
      "edit.delete",
      "edit.selectAll",
      "-",
      { label: "Convert Case to", items: CASES.map((c) => c.id) },
      {
        label: "Line Operations",
        items: [
          "line.duplicate",
          "line.removeDuplicates",
          "line.removeConsecutive",
          "line.split",
          "line.join",
          "line.moveUp",
          "line.moveDown",
          "line.removeEmpty",
          "line.removeEmptyBlank",
          "line.insertAbove",
          "line.insertBelow",
          "line.reverse",
          "line.randomize",
          "-",
          ...sorts("asc"),
          "-",
          ...sorts("desc"),
        ],
      },
      {
        label: "Blank Operations",
        items: ["blank.trimTrailing", "blank.trimLeading", "blank.trimBoth", "blank.eolToSpace", "blank.trimBothEol", "-", "blank.tabToSpace", "blank.spaceToTabAll", "blank.spaceToTabLeading"],
      },
      { label: "Indent", items: ["indent.more", "indent.less"] },
      { label: "Comment/Uncomment", items: ["comment.line", "comment.block"] },
      { label: "Base64", items: ["base64.encode", "base64.decode", "-", "base64.encodeUrl", "base64.decodeUrl"] },
      "-",
      "format.document",
    ],
  },
  {
    label: "Search",
    items: [
      "search.find",
      "search.replace",
      "search.findInFiles",
      "search.findInProjects",
      "search.mark",
      "-",
      "search.findNext",
      "search.findPrev",
      "-",
      { label: "Bookmark", items: ["bookmark.toggle", "bookmark.next", "bookmark.prev", "bookmark.clear", "-", "bm.cut", "bm.copy", "bm.paste", "bm.remove", "bm.removeNon", "bm.inverse"] },
      "marks.clear",
    ],
  },
  { label: "View", items: ["view.wordWrap", "view.showWhitespace", "view.showAllCharacters", "-", "view.functionList", "view.documentMap", "-", "view.splitVertical", "view.splitHorizontal", "view.closeSplit", "view.moveToOtherPane", "-", "view.theme.system", "view.theme.light", "view.theme.dark"] },
  { label: "Encoding", items: ["eol.lf", "eol.crlf", "eol.cr", "-", ...ENCODINGS.map((e) => e.id)] },
  { label: "Language", items: LANGUAGES.map((l) => `lang.${l.name}`) },
  { label: "JSON", items: ["json.pretty", "json.pretty4", "json.prettyTabs", "json.minify", "json.sortKeys", "-", "json.escape", "json.unescape", "-", "json.validate", "-", "convert.jsonToYaml", "convert.jsonToXml"] },
  {
    label: "XML",
    items: ["xml.format2", "xml.format4", "xml.formatTabs", "-", "xml.compact", "xml.sortAttributes", "-", "xml.escape", "xml.unescape", "-", "xml.validate", "-", "convert.xmlToJson"],
  },
  { label: "YAML", items: ["yaml.format2", "yaml.format4", "-", "yaml.compact", "yaml.sortKeys", "-", "yaml.validate", "-", "convert.yamlToJson"] },
  {
    label: "Macro",
    items: [
      "macro.startRecording",
      "macro.stopRecording",
      "-",
      "macro.playback",
      "macro.runMultiple",
      "-",
      "macro.saveAs",
      "macro.manage",
      "-",
      ...(savedMacroIds.length > 0 ? savedMacroIds : ["macro.none"]),
    ],
  },
  { label: "Settings", items: ["settings.open"] },
  { label: "Help", items: ["help.commandLine", "help.about"] },
  ];
}

export const MENU: MenuModel[] = buildMenu();

/** Every command id referenced by a menu, flattened (used by tests). */
export function menuIds(items: MenuItem[] = MENU.flatMap((m) => m.items)): string[] {
  return items.flatMap((i) => (i === "-" ? [] : typeof i === "string" ? [i] : menuIds(i.items)));
}
