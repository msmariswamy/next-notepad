## Why

The Notepad++ codebase in this repo is Windows-only (Win32/C++). We want a Notepad++-style editor that runs on macOS, Linux and Windows from one codebase, with a safer close experience: unsaved tabs persist across restarts instead of forcing a save prompt. Flutter was considered, but it has no mature code-editor widget; Tauri 2 + CodeMirror 6 gives a production-grade editor core and a testable TypeScript/Rust stack.

## What Changes

- Add a new cross-platform app in `notepad-next/` (Tauri 2 shell in Rust, CodeMirror 6 editor in TypeScript). The Windows C++ code is untouched. macOS is developed first; Windows and Linux are built in CI.
- Editor core and tabbed documents (open, save, save as, encodings, line endings, multi-caret, column selection, folding).
- Session restore: on quit, all open tabs (saved and untitled) and their contents are written to the app-data directory and restored on next launch. Cursor, scroll and undo history are not restored.
- Close behaviour: closing a tab prompts to save by default; a setting makes it silent. App quit follows the same setting (prompt vs silent session save). Silent mode never loses data because the session store retains everything.
- Full Find/Replace dialog matching Notepad++: Find, Replace, Find in Files, Find in Projects (searches the folder opened via "Open Folder"), and Mark (Mark All, Bookmark line, Clear marks, 5 mark styles). Search modes: Normal, Extended, Regular expression; options: match case, whole word, wrap around, backward direction, in selection, transparency; actions: Find Next, Count, Find All in Current Document, Find All in All Opened Documents.
- A `regex-compat` layer translates Notepad++-style patterns and replacements (`\1`/`$1`, `\h`, `\R`, `\x{..}`, named groups, flags) for the JS and Rust engines. Patterns needing lookaround or backreferences cannot run on Rust's `regex` crate, so Find in Files falls back to Rust-reads-files, JS-matches; results stay consistent with in-editor search.
- JSON tools: pretty-print, minify, validate with error line/column, and syntax highlighting.
- Settings: silent-close toggle (and a home for future options).
- Test-driven delivery: Vitest (TypeScript), `cargo test` (Rust backend), WebdriverIO with `tauri-driver` (end-to-end), GitHub Actions on macOS, Windows and Linux.
- **Deferred to follow-up changes:** plugins, macros, Run menu, Document Map, split view, Function List, UDL, JSON tree view.

## Capabilities

### New Capabilities
- `editor-core`: text editing, multi-caret, column mode, folding, encodings and line endings, file open/save.
- `tabs`: tabbed documents, dirty indicators, per-tab close prompt.
- `session-restore`: persist and restore all open tabs' contents across app restarts via the app-data directory.
- `find-replace`: Find and Replace tabs with all search modes, options and actions listed above.
- `find-in-files`: Find in Files and Find in Projects, backed by the Rust file walker and the `regex-compat` fallback.
- `mark`: Mark All, bookmark line, clear marks, 5 mark styles.
- `json-tools`: pretty-print, minify, validate with error position.
- `syntax-highlighting`: language detection and highlighting, including JSON.
- `settings`: user preferences, including the silent-close option.

### Modified Capabilities
<!-- None: the new app lives in notepad-next/ and does not change existing Windows behaviour. -->

## Impact

- New top-level directory `notepad-next/` (Tauri 2, Rust backend, TypeScript frontend, CodeMirror 6).
- New dependencies: Tauri 2, CodeMirror 6 and its language packages, Vitest, WebdriverIO, `tauri-driver`.
- New CI workflows for macOS, Windows and Linux builds and tests.
- No changes to the existing Windows C++ sources.
- Known limitation: Find in Files regex flavour differs from in-editor JS regex unless the fallback path is used (see `find-in-files` spec).
