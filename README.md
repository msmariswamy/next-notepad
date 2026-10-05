# next-notepad

[![Latest release](https://img.shields.io/github/v/release/msmariswamy/next-notepad?include_prereleases&label=release)](../../releases/latest)
[![Tests](https://img.shields.io/github/actions/workflow/status/msmariswamy/next-notepad/notepad-next.yml?label=tests)](../../actions/workflows/notepad-next.yml)

A fast, cross-platform text and code editor for **macOS, Windows and Linux**, built with
[Tauri 2](https://tauri.app) (Rust) and [CodeMirror 6](https://codemirror.net) (TypeScript).

Close the app and your unsaved tabs come back exactly as you left them.

## Features

- **Never lose text**: every open tab, saved or untitled, is stored on quit (and while you type) and restored on the
  next launch. Closing a tab can ask to save or be silent, your choice in Settings.
- **Powerful Find and Replace**: Find, Replace, Find in Files, Find in Projects and Mark, with Normal, Extended
  (`\n \r \t \0 \xNN`) and regular-expression modes, whole word, match case, in selection, backward, wrap around,
  Count, Find All, Replace All in all open tabs, and five mark styles with bookmarks.
- **JSON tools**: pretty-print (2 spaces, 4 spaces, tabs), compress, sort keys, escape and unescape, and validation that
  jumps to the error line and column.
- **Format Document** for JSON, JavaScript, TypeScript, HTML, CSS, XML, YAML and Java, with automatic language
  detection for untitled text.
- **Edit tools**: convert case, line operations (duplicate, remove duplicates, join, split, move, reverse, 14 sort
  orders), trim and tab/space conversion, indent and comment toggles, bookmarked-line operations.
- **Editing basics**: tabs, multiple carets, column selection, folding, syntax highlighting for 16 languages, light and
  dark themes, word wrap, show all characters (spaces, tabs, line endings), encoding and line-ending conversion.

## Download

Get the latest installer from the [Releases](../../releases) page (every push to `main` also produces test builds under
[Actions](../../actions/workflows/build-main.yml) > Artifacts):

| Platform | File |
|---|---|
| macOS (Apple Silicon and Intel) | `next-notepad_<version>_universal.dmg` |
| Windows | `next-notepad_<version>_x64-setup.exe` |

Builds are unsigned for now. On macOS, right-click the app and choose **Open** the first time. On Windows, choose
**More info** and then **Run anyway** in the SmartScreen prompt.

## Build and run from source

The app lives in [`notepad-next/`](notepad-next/). You need Node 22+, Rust (stable) and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
cd notepad-next
npm install
npm run tauri dev      # run the desktop app
npm run tauri build    # build the installer for your OS
npm run release -- patch   # bump the version, commit and tag a release
```

More detail, shortcuts and the release process are in [`notepad-next/README.md`](notepad-next/README.md).

## Test

```bash
cd notepad-next
npm run typecheck && npm test      # unit tests
npm run test:e2e                   # end-to-end tests (WebKit)
cd src-tauri && cargo test         # Rust backend tests
```

## Project layout

| Path | What it is |
|---|---|
| `notepad-next/` | The application (Tauri + TypeScript + Rust) |
| `openspec/` | Requirements, design, decisions and task list for the app |
| `adr/` | Architecture decision records |
| `.github/workflows/` | CI tests and the release workflow |

## License

No license has been chosen yet. Until one is added, all rights are reserved by the author.
