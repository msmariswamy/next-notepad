# next-notepad

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
and attaches both to a **draft** GitHub Release. Review it, then press **Publish release**. You can also run the workflow by
hand from the Actions tab and type the tag.

Unsigned builds work but show warnings (macOS Gatekeeper: right-click the app > Open; Windows SmartScreen: More info >
Run anyway). To sign and notarize the macOS build, add the `APPLE_*` repository secrets listed (commented) in
`.github/workflows/release-next-notepad.yml` and uncomment them.
