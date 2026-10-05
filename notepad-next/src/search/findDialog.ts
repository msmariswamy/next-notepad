import type { SearchMode } from "./regexCompat";
import type { FindController, SearchOutcome } from "./findController";
import { SearchHistory } from "./history";
import type { FilesOutcome, FilesSearchController, Where } from "./filesSearch";
import { dialogOpacity, type TransparencySettings } from "./transparency";

export type FindTab = "find" | "replace" | "files" | "projects" | "mark";

export const FIND_TABS: { id: FindTab; label: string }[] = [
  { id: "find", label: "Find" },
  { id: "replace", label: "Replace" },
  { id: "files", label: "Find in Files" },
  { id: "projects", label: "Find in Projects" },
  { id: "mark", label: "Mark" },
];

export interface FindDialogDeps {
  controller: FindController;
  /** Selected text to prefill "Find what" with (single-line selections only). */
  selectionText(): string;
  showResults(outcome: SearchOutcome): void;
  files: FilesSearchController;
  /** Current project root (set by "Open Folder"), or null. */
  projectRoot(): string | null;
  openFolder(): Promise<string | null>;
  pickFolder(): Promise<string | null>;
  confirmReplace(fileCount: number): Promise<boolean>;
}

export interface FindDialogHandle {
  dialog: HTMLDialogElement;
  setTab(tab: FindTab): void;
  /** Containers for the tabs implemented by later groups (files, projects, mark). */
  panel(tab: FindTab): HTMLElement;
  close(): void;
}

const findHistory = () => new SearchHistory("notepad-next.find-history");
const replaceHistory = () => new SearchHistory("notepad-next.replace-history");

let current: FindDialogHandle | null = null;

/** Opens (or re-focuses) the single non-modal Find dialog on the requested tab. */
export function openFindDialog(deps: FindDialogDeps, tab: FindTab = "find"): FindDialogHandle {
  if (current) {
    current.setTab(tab);
    (current.dialog.querySelector('[name="findWhat"]') as HTMLInputElement).select();
    return current;
  }
  current = buildDialog(deps, tab);
  return current;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { [k: string]: unknown } = {}, ...kids: (Node | string)[]) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...kids);
  return node;
}

function buildDialog(deps: FindDialogDeps, initialTab: FindTab): FindDialogHandle {
  const { controller } = deps;
  const st = controller.state;
  const findH = findHistory();
  const replaceH = replaceHistory();

  const dialog = el("dialog", { className: "find-dialog" });
  dialog.setAttribute("data-testid", "find-dialog");

  // ---- tabs
  const tabBar = el("div", { className: "find-tabs", role: "tablist" });
  const tabButtons = new Map<FindTab, HTMLButtonElement>();
  for (const t of FIND_TABS) {
    const b = el("button", { type: "button", textContent: t.label, className: "find-tab" });
    b.dataset.tab = t.id;
    b.addEventListener("click", () => setTab(t.id));
    tabButtons.set(t.id, b);
    tabBar.append(b);
  }

  // ---- inputs
  const history = (id: string, items: string[]) => {
    const list = el("datalist", { id });
    list.append(...items.map((v) => el("option", { value: v })));
    return list;
  };
  const findInput = el("input", { type: "text", name: "findWhat", autocomplete: "off" });
  findInput.setAttribute("list", "find-history");
  findInput.value = deps.selectionText() || st.pattern;
  const replaceInput = el("input", { type: "text", name: "replaceWith", autocomplete: "off" });
  replaceInput.setAttribute("list", "replace-history");
  replaceInput.value = st.replacement;
  const findList = history("find-history", findH.list());
  const replaceList = history("replace-history", replaceH.list());

  const labelled = (text: string, input: HTMLElement, cls = "") => {
    const row = el("label", { className: `find-row ${cls}` });
    row.append(el("span", { textContent: text }), input);
    return row;
  };
  const findRow = labelled("Find what:", findInput);
  const replaceRow = labelled("Replace with:", replaceInput, "only-replace");

  // ---- options
  const checkbox = (name: string, label: string, checked: boolean, onChange: (v: boolean) => void) => {
    const input = el("input", { type: "checkbox", name, checked });
    input.addEventListener("change", () => onChange(input.checked));
    const l = el("label", { className: "find-check" });
    l.append(input, el("span", { textContent: label }));
    return l;
  };
  const options = el("div", { className: "find-options" });
  options.append(
    checkbox("backward", "Backward direction", st.backward, (v) => (st.backward = v)),
    checkbox("wholeWord", "Match whole word only", st.opts.wholeWord, (v) => (st.opts.wholeWord = v)),
    checkbox("matchCase", "Match case", st.opts.matchCase, (v) => (st.opts.matchCase = v)),
    checkbox("wrap", "Wrap around", st.wrap, (v) => (st.wrap = v)),
    checkbox("inSelection", "In selection", st.inSelection, (v) => (st.inSelection = v)),
  );

  const modeGroup = el("fieldset", { className: "find-mode" });
  modeGroup.append(el("legend", { textContent: "Search Mode" }));
  const dotAll = el("input", { type: "checkbox", name: "dotMatchesNewline", checked: st.opts.dotMatchesNewline, disabled: st.opts.mode !== "regex" });
  dotAll.addEventListener("change", () => (st.opts.dotMatchesNewline = dotAll.checked));
  for (const [value, label] of [
    ["normal", "Normal"],
    ["extended", "Extended (\\n, \\r, \\t, \\0, \\x...)"],
    ["regex", "Regular expression"],
  ] as [SearchMode, string][]) {
    const r = el("input", { type: "radio", name: "mode", value, checked: st.opts.mode === value });
    r.addEventListener("change", () => {
      st.opts.mode = value;
      dotAll.disabled = value !== "regex";
    });
    const l = el("label", { className: "find-check" });
    l.append(r, el("span", { textContent: label }));
    modeGroup.append(l);
  }
  const dotLabel = el("label", { className: "find-check find-dot" });
  dotLabel.append(dotAll, el("span", { textContent: ". matches newline" }));
  modeGroup.append(dotLabel);

  // ---- messages
  const message = el("div", { className: "find-message" });
  message.setAttribute("data-testid", "find-message");
  message.setAttribute("role", "status");
  const say = (text: string, isError = false) => {
    message.textContent = text;
    message.classList.toggle("error", isError);
  };

  // ---- actions
  const sync = () => {
    st.pattern = findInput.value;
    st.replacement = replaceInput.value;
    findH.add(st.pattern);
    if (replaceInput.value) replaceH.add(replaceInput.value);
  };
  /** Run an action, turning an invalid regex into an inline message instead of an exception. */
  const run = (fn: () => string | void) => () => {
    sync();
    if (st.pattern === "") return say("Enter text to find.", true);
    try {
      const msg = fn();
      if (msg) say(msg);
    } catch (e) {
      if (e instanceof SyntaxError) say(`Invalid regular expression: ${e.message}`, true);
      else throw e;
    }
  };
  const btn = (label: string, onClick: () => void, cls = "") => {
    const b = el("button", { type: "button", textContent: label, className: cls });
    b.addEventListener("click", onClick);
    return b;
  };

  const findNextBtn = btn("Find Next", run(() => (controller.findNext() ? "" : "Can't find the text")), "find-next");
  const countBtn = btn("Count", run(() => `Count: ${controller.count()} match${controller.count() === 1 ? "" : "es"}`));
  const findAllCurrent = btn("Find All in Current Document", run(() => {
    const out = controller.findAllInCurrent();
    deps.showResults(out);
    return out.summary;
  }));
  const findAllOpened = btn("Find All in All Opened Documents", run(() => {
    const out = controller.findAllInOpened();
    deps.showResults(out);
    return out.summary;
  }));
  const replaceBtn = btn("Replace", run(() => (controller.replace() ? "" : "Can't find the text")));
  const replaceAllBtn = btn("Replace All", run(() => {
    const n = controller.replaceAll();
    return `Replace All: ${n} occurrence${n === 1 ? "" : "s"} replaced`;
  }));
  const replaceAllOpenedBtn = btn("Replace All in All Opened Documents", run(() => {
    const { replacements, files } = controller.replaceAllInOpened();
    return `Replace All in All Opened Documents: ${replacements} occurrence${replacements === 1 ? "" : "s"} replaced in ${files} document${files === 1 ? "" : "s"}`;
  }));
  const closeBtn = btn("Close", () => close());

  const findButtons = el("div", { className: "find-buttons only-find" });
  findButtons.append(findNextBtn, countBtn, findAllCurrent, findAllOpened);
  const replaceButtons = el("div", { className: "find-buttons only-replace" });
  const replaceFindNext = btn("Find Next", run(() => (controller.findNext() ? "" : "Can't find the text")), "find-next");
  replaceButtons.append(replaceFindNext, replaceBtn, replaceAllBtn, replaceAllOpenedBtn);

  // ---- Mark tab
  const markPanel = el("div", { className: "find-panel find-panel-mark" });
  let markStyle = 1;
  const markOpts = { bookmarkLine: false, purge: false };
  const styleGroup = el("fieldset", { className: "find-mark-styles" });
  styleGroup.append(el("legend", { textContent: "Marking" }));
  for (let i = 1; i <= 5; i++) {
    const r = el("input", { type: "radio", name: "markStyle", value: String(i), checked: i === 1 });
    r.addEventListener("change", () => (markStyle = i));
    const sw = el("span", { className: `mark-swatch mark-style-${i}`, textContent: `Style ${i}` });
    const l = el("label", { className: "find-check" });
    l.append(r, sw);
    styleGroup.append(l);
  }
  const markChecks = el("div", { className: "find-options" });
  markChecks.append(
    checkbox("bookmarkLine", "Bookmark line", false, (v) => (markOpts.bookmarkLine = v)),
    checkbox("purgeMarks", "Purge for each search", false, (v) => (markOpts.purge = v)),
  );
  const markAllBtn = btn("Mark All", run(() => {
    const n = controller.markAll({ style: markStyle, ...markOpts });
    return `Mark: ${n} match${n === 1 ? "" : "es"} marked`;
  }));
  const clearMarksBtn = btn("Clear all marks", () => {
    controller.clearMarks();
    say("All marks cleared");
  });
  const clearBookmarksBtn = btn("Clear all bookmarks", () => {
    controller.clearBookmarks();
    say("All bookmarks cleared");
  });
  const markButtons = el("div", { className: "find-buttons" });
  markButtons.append(markAllBtn, clearMarksBtn, clearBookmarksBtn);
  markPanel.append(el("div", { className: "find-grid" }, markChecks, styleGroup), markButtons);

  // ---- Find in Files / Find in Projects tabs
  const filesPanels = new Map<FindTab, HTMLElement>();
  const rootInputs = new Map<FindTab, () => string | null>();
  for (const kind of ["files", "projects"] as const) {
    const panel = el("div", { className: `find-panel find-panel-${kind}` });
    const filters = el("input", { type: "text", name: `${kind}Filters`, value: "*.*" });
    const recursive = el("input", { type: "checkbox", name: `${kind}Recursive`, checked: true });
    const hidden = el("input", { type: "checkbox", name: `${kind}Hidden`, checked: false });
    const sub = el("label", { className: "find-check" });
    sub.append(recursive, el("span", { textContent: "In all sub-folders" }));
    const hid = el("label", { className: "find-check" });
    hid.append(hidden, el("span", { textContent: "In hidden folders" }));

    let getRoot: () => string | null;
    const rootRow = el("div", { className: "find-row" });
    const dirInput = el("input", { type: "text", name: "directory", placeholder: "Folder to search" });
    const rootLabel = el("span", { className: "project-root" });
    rootLabel.setAttribute("data-testid", "project-root");
    const folderBtn = btn(kind === "files" ? "Browse…" : "Open Folder…", async () => {
      if (kind === "files") {
        const picked = await deps.pickFolder();
        if (picked) dirInput.value = picked;
      } else {
        await deps.openFolder();
        refreshProject();
      }
    });
    if (kind === "files") {
      rootRow.append(el("span", { textContent: "Directory:" }), dirInput, folderBtn);
      getRoot = () => dirInput.value.trim() || null;
    } else {
      rootRow.append(el("span", { textContent: "Project:" }), rootLabel, folderBtn);
      getRoot = () => deps.projectRoot();
    }
    rootInputs.set(kind, getRoot);
    const filterRow = labelled("Filters:", filters);

    const where = (): Where | null => {
      const root = getRoot();
      if (!root) {
        say(kind === "files" ? "Enter a directory to search." : "Open a folder to search the project.", true);
        return null;
      }
      return { root, filters: filters.value.trim() || "*.*", recursive: recursive.checked, includeHidden: hidden.checked };
    };
    const render = (o: FilesOutcome) => {
      deps.showResults(o);
      say(o.summary);
    };
    const cancelBtn = btn("Cancel", () => void deps.files.cancel());
    cancelBtn.hidden = true;
    const findAllBtn = btn("Find All", async () => {
      sync();
      const w = where();
      if (!w) return;
      if (st.pattern === "") return say("Enter text to find.", true);
      cancelBtn.hidden = false;
      say("Searching…");
      try {
        render(await deps.files.find({ pattern: st.pattern, replacement: st.replacement, opts: st.opts }, w, render));
      } catch (e) {
        if (e instanceof SyntaxError) say(`Invalid regular expression: ${e.message}`, true);
        else say(String(e), true);
      } finally {
        cancelBtn.hidden = true;
      }
    }, `files-find-all`);
    const replaceFilesBtn = btn(kind === "files" ? "Replace in Files" : "Replace in Project", async () => {
      sync();
      const w = where();
      if (!w) return;
      if (st.pattern === "") return say("Enter text to find.", true);
      try {
        const r = await deps.files.replaceInFiles({ pattern: st.pattern, replacement: st.replacement, opts: st.opts }, w, deps.confirmReplace);
        say(r.status === "cancelled" ? "Replace in Files: nothing changed" : `Replace in Files: ${r.replacements} occurrence${r.replacements === 1 ? "" : "s"} replaced in ${r.files} file${r.files === 1 ? "" : "s"}`);
      } catch (e) {
        say(e instanceof SyntaxError ? `Invalid regular expression: ${e.message}` : String(e), true);
      }
    });
    const buttons = el("div", { className: "find-buttons" });
    buttons.append(findAllBtn, replaceFilesBtn, cancelBtn);

    const disableables = [findAllBtn, replaceFilesBtn, filters, recursive, hidden];
    const refreshProject = () => {
      if (kind !== "projects") return;
      const root = deps.projectRoot();
      rootLabel.textContent = root ?? "No folder opened — use Open Folder…";
      disableables.forEach((c) => (c.disabled = root === null));
    };
    refreshProject();
    panel.dataset.panel = kind;
    panel.append(rootRow, filterRow, el("div", { className: "find-options" }, sub, hid), buttons);
    (panel as HTMLElement & { refresh?: () => void }).refresh = refreshProject;
    filesPanels.set(kind, panel);
  }

  // ---- transparency
  const transparency: TransparencySettings = { enabled: false, mode: "blur", level: 70 };
  let focused = true;
  const applyOpacity = () => (dialog.style.opacity = String(dialogOpacity(transparency, focused)));
  const tEnabled = el("input", { type: "checkbox", name: "transparency" });
  tEnabled.addEventListener("change", () => {
    transparency.enabled = tEnabled.checked;
    applyOpacity();
  });
  const tGroup = el("fieldset", { className: "find-transparency" });
  tGroup.append(el("legend", {}, el("label", {}, tEnabled, " Transparency")));
  for (const [value, label] of [
    ["blur", "On losing focus"],
    ["always", "Always"],
  ] as const) {
    const r = el("input", { type: "radio", name: "transparencyMode", value, checked: value === "blur" });
    r.addEventListener("change", () => {
      transparency.mode = value;
      applyOpacity();
    });
    const l = el("label", { className: "find-check" });
    l.append(r, el("span", { textContent: label }));
    tGroup.append(l);
  }
  const slider = el("input", { type: "range", name: "transparencyLevel", min: "20", max: "100", value: "70" });
  slider.addEventListener("input", () => {
    transparency.level = Number(slider.value);
    applyOpacity();
  });
  tGroup.append(slider);
  dialog.addEventListener("focusin", () => ((focused = true), applyOpacity()));
  window.addEventListener("blur", () => ((focused = false), applyOpacity()));
  window.addEventListener("focus", () => ((focused = true), applyOpacity()));

  // ---- panels for later tabs
  const panels = new Map<FindTab, HTMLElement>();
  panels.set("mark", markPanel);
  for (const [t, p] of filesPanels) panels.set(t, p);

  const main = el("div", { className: "find-main" });
  main.append(findRow, replaceRow, el("div", { className: "find-grid" }, options, modeGroup), tGroup);
  dialog.append(tabBar, main, findButtons, replaceButtons, ...panels.values(), message, closeBtn, findList, replaceList);

  function setTab(tab: FindTab) {
    for (const [id, b] of tabButtons) b.classList.toggle("active", id === tab);
    dialog.dataset.tab = tab;
    main.hidden = false;
    findButtons.hidden = tab !== "find";
    replaceButtons.hidden = tab !== "replace";
    replaceRow.hidden = !(tab === "replace" || tab === "files" || tab === "projects");
    (panels.get(tab) as (HTMLElement & { refresh?: () => void }) | undefined)?.refresh?.();
    for (const [id, p] of panels) p.hidden = id !== tab;
    say("");
  }

  function close() {
    dialog.close();
  }
  dialog.addEventListener("close", () => {
    dialog.remove();
    current = null;
  });
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Enter" && e.target === findInput) {
      e.preventDefault();
      (dialog.dataset.tab === "replace" ? replaceFindNext : findNextBtn).click();
    }
  });

  document.body.append(dialog);
  dialog.show(); // non-modal so the editor stays usable while the dialog is open
  setTab(initialTab);
  findInput.select();
  findInput.focus();

  return {
    dialog,
    setTab,
    panel: (t) => panels.get(t) ?? main,
    close,
  };
}
