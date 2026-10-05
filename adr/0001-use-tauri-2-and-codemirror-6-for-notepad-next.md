---
status: "accepted"
date: 2026-10-05
decision-makers: mariswamypillai
consulted: none
informed: none
---

# Use Tauri 2 with CodeMirror 6 for the cross-platform notepad-next app

Supersedes: none

## Context and Problem Statement

The existing Notepad++ sources in this repo are Win32/C++ and cannot run on macOS or Linux. We need a Notepad++-style editor that runs on macOS, Linux and Windows from one codebase, with macOS developed first and a spec-driven, test-driven delivery process. Flutter was the user's initial suggestion. The framework choice constrains the editor engine, test tooling, regex engine and packaging for every later change.

## Decision Drivers

- One codebase for macOS, Linux and Windows
- A production-grade text-editing core (multi-caret, column selection, folding, large documents) without building one
- Testability for TDD at unit and end-to-end level
- Small runtime footprint and a native backend for file I/O and search
- Development speed for a single developer

## Considered Options

- Tauri 2 + CodeMirror 6 (TypeScript frontend, Rust backend)
- Flutter desktop with a custom or third-party editor widget
- Qt 6 + Scintilla (C++)
- Electron + Monaco

## Decision Outcome

Chosen option: "Tauri 2 + CodeMirror 6", because it provides a mature editor core out of the box, a Rust backend for the filesystem and search, a small binary, and a testing stack (Vitest, `cargo test`, WebDriver) that fits TDD.

### Consequences

- Good, because multi-caret, rectangular selection, folding, a language system and a virtualised viewport come from CodeMirror 6.
- Good, because the Rust backend is unit-testable with `cargo test` and the frontend with Vitest.
- Bad, because rendering depends on three different system webviews (WKWebView, WebView2, WebKitGTK), so behaviour can differ per OS.
- Bad, because very large files (roughly above 50 MB) will perform worse than a Scintilla-based editor.
- Bad, because `tauri-driver` does not currently support macOS desktop, so macOS end-to-end tests need a workaround.
- Neutral, because the stack is two languages (TypeScript and Rust), which raises the skill bar for contributors.

### Confirmation

Confirmed by CI building and running the unit and end-to-end suites on macOS, Windows and Linux, and by the spec scenarios in `openspec/changes/macos-flutter-notepad/specs/` passing.

## Pros and Cons of the Options

### Tauri 2 + CodeMirror 6

Web-based editor core in a native shell with a Rust backend.

- Good, because the editor core is mature and extensible.
- Good, because the binary is small compared with Electron.
- Bad, because webview differences between operating systems must be tested.

### Flutter desktop

Single UI toolkit drawing its own widgets on all three desktops.

- Good, because it is one language and one renderer on all platforms.
- Bad, because there is no mature code-editor widget, so the editor core would be custom work.
- Bad, because text editing is Flutter desktop's weakest area.

### Qt 6 + Scintilla

The same editor engine Notepad++ uses, inside a C++ GUI framework.

- Good, because it is the closest match to Notepad++ and handles very large files best.
- Bad, because it is slower to build and harder to unit-test.
- Bad, because build and packaging complexity is higher across three OSes.

### Electron + Monaco

Web editor core in a bundled Chromium runtime.

- Good, because one consistent rendering engine on all OSes.
- Bad, because the runtime is much larger and heavier.

## More Information

See `openspec/changes/macos-flutter-notepad/design.md` decision D1. Revisit if large-file performance or webview differences become blocking.
