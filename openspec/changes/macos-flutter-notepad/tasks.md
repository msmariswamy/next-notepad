## 1. Scaffold and tooling (ADR-0001, ADR-0002)

- [x] 1.1 Create `notepad-next/` with a Tauri 2 + TypeScript (Vite) app; `npm run tauri dev` opens an empty window on macOS
- [x] 1.2 Configure Vitest and a sample passing test; `npm test` runs green
- [x] 1.3 Configure `cargo test` with a sample passing test in `src-tauri`
- [x] 1.4 Restrict Tauri capabilities so the webview has no direct filesystem scope (ADR-0002)
- [x] 1.5 Add typed IPC client module wrapping Tauri `invoke` with a mockable interface for unit tests
- [x] 1.6 Add GitHub Actions workflow running Vitest, `cargo test` and a build on macOS, Windows and Linux
- [x] 1.7 macOS-only end-to-end for now: Playwright (WebKit) against the Vite dev server with mocked IPC; WebdriverIO + `tauri-driver` for Linux/Windows deferred to a follow-up

## 2. Editor core (spec: editor-core)

- [x] 2.1 Write tests for open/save/save-as commands in Rust (read, write, atomic save), then implement them
- [x] 2.2 Write tests for encoding and EOL detection (UTF-8, UTF-8 BOM, UTF-16, CRLF/LF), then implement with `encoding_rs`
- [x] 2.3 Embed CodeMirror 6 with line numbers, multi-cursor, rectangular selection and code folding
- [x] 2.4 Implement the status bar (Ln/Col, selection, length, lines, EOL, encoding, language) with tests for its formatting logic
- [ ] 2.5 Implement EOL conversion and encoding display; round-trip save keeps encoding and EOL
- [ ] 2.6 Implement large-file warning (default 50 MB) with a test for the threshold check
- [ ] 2.7 Build the menu bar (File, Edit, Search, View, Encoding, Language, Settings) with native shortcuts per platform

## 3. Tabs (spec: tabs)

- [x] 3.1 Write tests for the document manager (create, switch, reorder, close, untitled numbering), then implement
- [x] 3.2 Implement the tab bar UI with active highlight and drag reordering
- [x] 3.3 Implement dirty tracking and the modified indicator, with tests for set/clear on edit and save
- [x] 3.4 Implement the close-tab flow with Save / Don't Save / Cancel prompt when `silentClose` is off
- [x] 3.5 Implement silent close that moves dirty content to a bounded recently-closed list

## 4. Settings (spec: settings)

- [x] 4.1 Write tests for the settings store (defaults, merge, atomic write, corrupt-file fallback with `.corrupt` rename), then implement in Rust
- [x] 4.2 Implement the Settings dialog and persist changes immediately
- [x] 4.3 Add `silentClose` (default off), theme, font family/size, word wrap, show whitespace, and large-file threshold options
- [x] 4.4 Apply theme and font settings live to all open editors

## 5. Session restore (spec: session-restore, ADR-0002)

- [x] 5.1 Write Rust tests for the session store: atomic write, per-tab content files, interrupted-write recovery, corrupt-session quarantine, then implement
- [x] 5.2 Define the `session.json` schema (tabs, active tab, recently closed) with serialisation tests
- [x] 5.3 Implement the session client with a debounced snapshot (about 2 s) and a final flush on quit
- [x] 5.4 Implement restore on launch: tabs, content, encoding, EOL, dirty state, active tab; caret starts at the document start
- [x] 5.5 Handle restored tabs whose file is missing: keep text, mark path missing
- [x] 5.6 Implement quit flow for `silentClose` off (prompt per dirty tab) and on (no prompt, snapshot only)
- [x] 5.7 End-to-end test: type in untitled tabs, quit, relaunch, assert tabs and text restored; crash-kill variant

## 6. regex-compat layer (spec: find-replace, find-in-files, ADR-0003)

- [x] 6.1 Write the shared cross-engine test table (Normal, Extended, regex cases, replacements, flags)
- [x] 6.2 Implement the Normal and Extended mode translators (escape, `\n \r \t \0 \xNN`) with tests
- [x] 6.3 Implement regex translation (`\h`, `\R`, `\x{..}`, named groups, flag mapping) for JS and Rust targets
- [x] 6.4 Implement replacement translation (`\1`..`\9`, `$1`..`$9`) with tests
- [x] 6.5 Implement detection of lookahead, lookbehind and backreferences returning `needsJsEngine`
- [x] 6.6 Run the shared table through both engines in Vitest and `cargo test`; they must agree wherever Rust is eligible

## 7. Find and Replace in the document (spec: find-replace)

- [x] 7.1 Write tests for the search service (Find Next forward/backward, wrap, whole word, match case, in selection), then implement on CodeMirror state
- [x] 7.2 Build the Find dialog shell with tabs Find, Replace, Find in Files, Find in Projects, Mark and the layout in the reference screenshot
- [x] 7.3 Implement Find Next, Count, Find All in Current Document and Find All in All Opened Documents with the results panel
- [x] 7.4 Implement Replace, Replace All and Replace All in All Opened Documents; Replace All is a single undo step
- [x] 7.5 Implement search modes Normal, Extended and Regular expression with ". matches newline" and inline invalid-regex errors
- [x] 7.6 Implement search history for Find what and Replace with, persisted across restarts
- [x] 7.7 Implement the Transparency option (on losing focus / always, adjustable level)
- [x] 7.8 Wire keyboard shortcuts and menu entries for Find, Replace, Find Next/Previous
- [x] 7.9 End-to-end test: open Replace tab, run Replace All with capture groups, verify text and undo

## 8. Mark and bookmarks (spec: mark)

- [x] 8.1 Write tests for the mark StateField (add, clear by style, purge, mapping through edits), then implement
- [x] 8.2 Implement five mark styles with CSS classes and a style selector on the Mark tab
- [x] 8.3 Implement bookmark line gutter markers with next/previous bookmark navigation and tests
- [x] 8.4 Implement Mark All, Purge for each search and Clear all marks

## 9. Find in Files and Projects (spec: find-in-files, ADR-0002, ADR-0003)

- [ ] 9.1 Write Rust tests for the directory walker (filters, sub-folders, hidden folders, binary and unreadable skipping), then implement
- [ ] 9.2 Implement the Rust search engine for eligible patterns with streaming results and cancellation
- [ ] 9.3 Implement the JS-fallback path: Rust streams file contents, frontend matches; shared result shape with tests for identical positions
- [ ] 9.4 Implement the Find in Files tab (directory, filters, toggles) and the streaming results panel
- [ ] 9.5 Implement Replace in Files with a confirmation showing the affected file count
- [ ] 9.6 Implement Open Folder and the Find in Projects tab (disabled until a folder is opened)
- [ ] 9.7 End-to-end test: search a fixture directory with a lookahead pattern and a plain pattern

## 10. JSON tools (spec: json-tools)

- [ ] 10.1 Write tests for pretty-print, minify, and validate with line/column error positions, then implement
- [ ] 10.2 Implement the commands for the whole document and for the selection; apply as one undo step
- [ ] 10.3 Show validation results and move the caret to the error position
- [ ] 10.4 Document formatting side effects (duplicate keys, number normalisation) in user-facing help

## 11. Syntax highlighting (spec: syntax-highlighting)

- [ ] 11.1 Write tests for extension-to-language detection, then implement with fallback to plain text
- [ ] 11.2 Add the Language menu with manual override
- [ ] 11.3 Integrate language packages for JSON, JavaScript, TypeScript, HTML, CSS, XML, Markdown, YAML, Python, Java, C, C++, Rust, Go, shell and SQL
- [ ] 11.4 Add light and dark highlight themes with a contrast check, switchable without reloading documents

## 12. Hardening and release readiness

- [ ] 12.1 Verify every spec scenario maps to at least one automated test; list any gaps
- [ ] 12.2 Run `openspec validate macos-flutter-notepad --type change --strict`
- [ ] 12.3 Run the full test suite on macOS, Windows and Linux in CI
- [ ] 12.4 Resolve design open questions: macOS end-to-end approach, recently-closed list UI, large-file threshold, app name and bundle identifier
- [ ] 12.5 Write `notepad-next/README.md` with build, run and test instructions
