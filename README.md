# next-notepad

> **Idea and creation by Mariswamy Pillai.**

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
- **XML and YAML tools**: XML and YAML menus next to JSON with Format, Compact, Validate and Sort (XML attributes, YAML keys),
  XML escape/unescape, and live error underlines. **Convert** between JSON, YAML and XML (JSON to YAML, YAML to JSON,
  XML to JSON, JSON to XML); the result opens in a new tab and the original is untouched.
- **Format Document** for JSON, JavaScript, TypeScript, HTML, CSS, XML, YAML and Java, with automatic language
  detection for untitled text.
- **Edit tools**: convert case, line operations (duplicate, remove duplicates, join, split, move, reverse, 14 sort
  orders), trim and tab/space conversion, indent and comment toggles, bookmarked-line operations.
- **Macros**: record typing, movement keys, menu commands and Find/Replace; play back once, several times or until the
  end of the file (one undo step), and save named macros that survive restarts.
- **Split view, Function List and Document Map**: view one document in two panes (vertical or horizontal, live-synced),
  jump around with a filterable outline of functions, classes and headings, and scroll with a minimap.
- **Base64 encode and decode** (standard and URL-safe) for the selection or the whole document, and your caret and
  scroll position come back with your tabs.
- **Command line and `kubectl edit`**: `next-notepad [--wait] file...` opens files in the running app (starting it if needed).
  With `--wait` it stays open until you close the file, so next-notepad works as `KUBE_EDITOR`, `GIT_EDITOR` or `EDITOR`.
  Help > Command Line Tool… installs the command (macOS) and shows the line to paste.
- **Editing basics**: tabs, multiple carets, column selection, folding, syntax highlighting for 16 languages, light and
  dark themes, word wrap, show all characters (spaces, tabs, line endings), encoding and line-ending conversion.

## Download

Get the latest installer from the [Releases](../../releases) page (every push to `main` also produces test builds under
[Actions](../../actions/workflows/build-main.yml) > Artifacts):

| Platform | File |
|---|---|
| macOS (Apple Silicon and Intel) | `next-notepad_<version>_universal.dmg` |
| Windows | `next-notepad_<version>_x64-setup.exe` |

Builds are not notarized yet, so the first launch needs one extra step. On macOS, drag the app to Applications, try to open
it, then go to **System Settings > Privacy & Security** and click **Open Anyway** (on older macOS, right-click the app and
choose **Open**). If macOS still says the app is damaged, run `xattr -dr com.apple.quarantine /Applications/next-notepad.app`.
On Windows, choose **More info** and then **Run anyway** in the SmartScreen prompt.

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

## Credits

next-notepad was conceived and created by **Mariswamy Pillai**. The same credit is shown in the app under **Help > About**.

## License

No license has been chosen yet. Until one is added, all rights are reserved by the author.
