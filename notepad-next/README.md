# next-notepad

Idea and creation by **Mariswamy Pillai**.

A cross-platform (macOS first, then Linux and Windows) Notepad++-style editor built with
**Tauri 2** (Rust backend) and **CodeMirror 6** (TypeScript frontend). See
`openspec/changes/macos-flutter-notepad/` for the proposal, design, specs and tasks, and `adr/` for
the architecture decisions (ADR-0001 stack, ADR-0002 Rust owns the filesystem, ADR-0003 regex-compat).

## Run

```bash
cd notepad-next
npm install
npm run tauri dev      # native window
npm run dev            # browser only (in-memory files; used by the end-to-end tests)
```

Requires Node 22+, Rust (stable) and the Tauri prerequisites for your OS.

## Test

```bash
npm run typecheck      # tsc
npm test               # Vitest (unit tests)
npm run test:e2e       # Playwright WebKit against the Vite dev server (macOS)
cd src-tauri && cargo test   # Rust backend
```

`shared/regex-cases.json` is a table that both the TypeScript and the Rust regex engines must agree on
(ADR-0003). End-to-end tests run in WebKit with the Tauri IPC replaced by an in-memory host;
`tauri-driver` (Linux/Windows) is a planned follow-up.

## Features

- Tabs, multi-caret and column selection, code folding, status bar, themes (light/dark/system).
- **Unsaved tabs survive quit and crashes.** Every open tab (saved or untitled) and its text are stored in the
  app-data directory and restored on launch. By default closing a dirty tab or quitting asks to save; turn on
  *Close without prompting* in Settings to skip the prompts (text is kept in the session either way).
- Find / Replace / Find in Files / Find in Projects / Mark, with Normal, Extended (`\n \r \t \0 \xNN`) and
  regular-expression modes. Documents hold `\n` line breaks internally, so `\r\n`, `\r?\n` and `\r` all match a
  line break and a replacement of `\r\n` inserts one.
- Find in Files runs in Rust; patterns that use lookahead, lookbehind or backreferences (which Rust's regex
  engine lacks) are matched in the JavaScript engine over file contents read by Rust, so results are identical
  to in-editor search.
- JSON menu: **Pretty-print** (2 spaces / 4 spaces / tabs), **Compress** (minify), **Sort Keys**, **Escape / Unescape as JSON String**
  and **Validate** (reports line and column and moves the caret there).
- **XML menu**: Format (2 spaces / 4 spaces / tabs), **Compact** (removes whitespace between tags, never touching text, comments,
  CDATA or `xml:space="preserve"` content), **Validate** (line and column), **Sort Attributes**, **Escape / Unescape**. An XML
  tab underlines the first well-formedness error while you type.
- **YAML menu**: Format (2 or 4 spaces), **Compact** (flow style, single document only), **Validate** (every document),
  **Sort Keys** (every depth, comments stay with their keys). A selection is dedented, processed and re-indented. A YAML tab
  underlines the first syntax error while you type.
- **Convert** (JSON, YAML and XML menus): JSON to YAML, YAML to JSON, XML to JSON and JSON to XML open the result in a **new
  tab** and report anything that could not be kept (dropped comments, flattened mixed content, keys turned into strings).
  XML to JSON uses `@attr` for attributes and `#text` for text, with repeated elements as arrays.
- **Format Document** (Edit menu, ⌥⌘L / Ctrl+Alt+L) for JSON, JavaScript, TypeScript, HTML, CSS, XML, YAML and Java, using the
  tab width / tabs settings. JavaScript, TypeScript, CSS and YAML use Prettier (loaded on first use); HTML, XML and Java use
  built-in formatters that always put each element or block on its own indented line. Invalid code is never modified and
  the error position is shown.
- **Language auto-detect**: an untitled tab (or a file with an unknown extension) whose content looks like JSON, XML, HTML,
  YAML or Java is switched to that language automatically. Your own choice from the Language menu and a recognised file
  extension always win. Format Document detects first when the tab is still plain text.
- **Edit menu** modelled on Notepad++: Cut/Copy/Paste/Delete, Convert Case (8 modes), Line Operations (duplicate, remove
  duplicates, join, split, move, remove empty, insert blank, reverse, randomize and 14 sort orders), Blank Operations (trim,
  EOL to space, TAB/space conversion), Indent / Outdent and Comment toggles.
- **Search > Bookmark**: toggle / next / previous / clear, plus cut, copy, paste-replace, remove, remove-non-bookmarked and
  inverse for bookmarked lines.
- **View**: Word Wrap, Show Whitespace, **Show All Characters** (spaces, tabs and LF / CRLF / CR markers; the text itself is
  never changed) and theme. Settings has tab width and an option to insert a tab character instead of spaces.
- **Macro menu**: *Start / Stop Recording* captures typed, pasted and deleted text, movement keys (arrows, Home/End, ...),
  menu commands and Find / Replace actions with their options. *Playback* replays the last recorded macro at the caret,
  *Run a Macro Multiple Times* repeats it a number of times or until the end of the file, and a whole playback (however
  many repeats) is **one undo step**. *Save Current Recorded Macro* names it; saved macros are listed in the menu and kept in
  `macros.json` in the app-data directory (see *Manage Saved Macros* to rename or delete). Commands that open dialogs or tabs
  run but are not recorded, and a macro stops with a message if a step fails (for example a Find with no match).
- **View > Split Vertically / Horizontally** shows the tab in two panes that share one document and one undo history, each
  with its own caret and scroll; *Close Split* and *Move to Other Pane* are in the same menu. Switching tabs closes the split.
- **View > Function List** (functions, classes, methods and headings of 16 languages, filterable, click to jump) and
  **View > Document Map** (a minimap with a draggable viewport; it switches off above 50,000 lines or the large-file
  threshold) are docked on the right, and remember whether they were shown.
- **Edit > Base64**: Encode / Decode (standard and URL-safe) the selection, every selection range, or the whole document;
  invalid input is never modified and the reason is shown.
- The caret and scroll position of every tab are stored with the session and restored on launch.

### Opening files from Finder

- Drag one or more files onto the window: each opens as a tab, in drop order, and the last one is active. A file that is
  already open is just focused, a large file asks first (as File > Open does), and a folder or unreadable item shows a
  "cannot open" message without stopping the others.
- The macOS bundle declares an **alternate** handler for any file, so next-notepad appears in Finder's *Open With* list and
  accepts files dropped on its Dock or app icon. It never becomes the default application for any file type.
- `npm run check:plist` (macOS) checks the built app's `Info.plist` for exactly that declaration.

### Command line

```bash
next-notepad notes.txt              # open files in the running app (starts it if it is closed)
next-notepad --wait deployment.yaml # stay open until the file's tab is closed
next-notepad --help
```

`--wait` is what makes next-notepad usable as an editor for other tools:

```bash
export KUBE_EDITOR="next-notepad --wait"   # kubectl edit cm my-config
export GIT_EDITOR="next-notepad --wait"    # git commit
```

Help > **Command Line Tool…** shows the full path of the executable, installs the `next-notepad` command on macOS (a link in
`/usr/local/bin`, or `~/.local/bin` if that is not writable), and gives ready-to-paste `KUBE_EDITOR` lines for zsh/bash,
PowerShell and `setx`. Closing the tab ends the wait; if the tab has unsaved changes you are asked first, and closing without
saving leaves the file unchanged, so `kubectl` cancels the edit. Quitting the app also ends the wait. If the app crashes while a
command is waiting, the command exits with code 1 so the calling tool does not apply a half-edited file.

Exit codes: 0 success, 1 failure, 2 usage error, 3 the app could not be started or reached. The command talks to the app
over a loopback-only socket protected by a token in `cli-server.json` in the app-data directory (ADR-0009).

### JSON formatting notes

Formatting parses and re-prints the JSON, so:

- **Duplicate keys collapse** into one key (first position, last value).
- Numbers, string escapes and key order are kept exactly as written.
- Comments and trailing commas are not valid JSON; the document is left unchanged and the error position is shown.
- Pretty-print and Minify work on the selection when there is one, otherwise on the whole document, and are a
  single undo step.

## Shortcuts

| | macOS | Other |
|---|---|---|
| Find / Replace / Find in Files | ⌘F / ⌘H / ⇧⌘F | Ctrl+F / Ctrl+H / Ctrl+Shift+F |
| Find next / previous | ⌘G / ⇧⌘G | Ctrl+G / Ctrl+Shift+G |
| Bookmark toggle / next / previous | ⌘F2 / F2 / ⇧F2 | Ctrl+F2 / F2 / Shift+F2 |
| JSON pretty-print / minify / validate | ⌥⌘J / ⌥⇧⌘J / ⌥⌘V | Ctrl+Alt+J / Ctrl+Alt+Shift+J / Ctrl+Alt+V |
| Format Document | ⌥⌘L | Ctrl+Alt+L |
| Upper / lower case | ⇧⌘U / ⌘U | Ctrl+Shift+U / Ctrl+U |
| Join lines / duplicate line | ⌘J / ⇧⌘D | Ctrl+J / Ctrl+Shift+D |
| Move line up / down | ⌥↑ / ⌥↓ | Alt+Up / Alt+Down |
| Preferences | ⌘, | Ctrl+, |

## App icon

`design/app-icon.svg` is the source. `node design/render-icon.mjs` renders `design/app-icon.png`, and `npx tauri icon design/app-icon.png` regenerates everything in `src-tauri/icons/`.

## Builds and releases

There are two GitHub Actions workflows (each OS is built on that OS; you can also build locally with `npm run tauri build`):

**Test builds, automatic (`build-main`).** Every push to `main` that changes `notepad-next/` builds a macOS `.dmg` and a
Windows `.exe`. Open the workflow run on the *Actions* tab and download the installers from **Artifacts** (kept 30 days).
These are for trying the latest code; nothing is published and there is no version number.

**Releases, deliberate (`release-next-notepad`).** One command bumps the version everywhere, commits and tags it:

```bash
cd notepad-next
npm run release -- patch            # 0.1.0 -> 0.1.1   (or: minor, major, or an exact 1.2.3)
npm run release -- minor --push     # also pushes the commit and the tag, which starts the build
npm run release -- patch --dry-run  # only shows the new version
```

The script updates `tauri.conf.json`, `package.json`, `package-lock.json`, `Cargo.toml` and `Cargo.lock`, creates the
commit `Release vX.Y.Z` and the tag `vX.Y.Z`, and refuses to run on a dirty working tree, off `main`, or if the tag exists.
Without `--push`, finish with `git push origin main && git push origin vX.Y.Z`.

Pushing the tag builds a universal macOS `.dmg` (Apple Silicon and Intel) and a Windows `.exe`, runs the unit tests first,
and publishes both on the repository's **Releases** page automatically, with generated release notes. You can also run the workflow
by hand from the Actions tab and type the tag.

Builds are ad-hoc signed but not notarized, so they show warnings (macOS Gatekeeper: System Settings > Privacy & Security >
Open Anyway; Windows SmartScreen: More info > Run anyway). To sign and notarize the macOS build, add the `APPLE_*` repository secrets listed (commented) in
`.github/workflows/release-next-notepad.yml` and uncomment them.
