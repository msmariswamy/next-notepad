## 1. Base64 transform (spec: base64-transform)

- [ ] 1.1 Write tests for `encode`/`decode` in `src/edit/base64.ts` (ASCII, non-ASCII UTF-8 round-trip, URL-safe alphabet, whitespace and missing padding on decode, invalid alphabet, invalid UTF-8), then implement
- [ ] 1.2 Write tests for the editor operation (selection, whole document when empty, multiple ranges, all-or-nothing when one range is invalid, one undo step), then implement it on top of the pure module
- [ ] 1.3 Register `base64.encode`, `base64.decode`, `base64.encodeUrl`, `base64.decodeUrl` in the command registry under a new Edit > Base64 submenu, with a toast carrying the reason on failure
- [ ] 1.4 Add a macOS Playwright e2e flow: encode, decode, invalid input leaves the text unchanged

## 2. Settings and View menu toggles (specs: view-options; design D5)

- [ ] 2.1 Write tests for `showFunctionList` and `showDocumentMap` (defaults false, sanitize, older settings file without the keys), then add them to `src/settings/model.ts`
- [ ] 2.2 Add the same two fields to the Rust `Settings` struct with `serde(default)` and a `cargo test` that loads a settings file without them
- [ ] 2.3 Implement the workspace layout: editor area plus a right dock that shows or hides each panel from settings
- [ ] 2.4 Add checkable View > Function List and View > Document Map commands wired to the settings store, with tests for persistence

## 3. Session cursor and scroll restore (spec: session-restore; design D6)

- [ ] 3.1 Write Rust tests for `TabSnapshot` with optional `selection` and `scrollTop` (round-trip, old `session.json` without the fields), then add them with `serde(default)`
- [ ] 3.2 Write tests for capturing selection and scroll in `buildSnapshot` (from the stored `EditorState` and from the live view), then implement
- [ ] 3.3 Write tests for restoring the position, including clamping to the document length when the file changed, then implement in the restore path in `src/app/app.ts`
- [ ] 3.4 Mark the session dirty on scroll and selection changes without shortening the 2 s debounce
- [ ] 3.5 Add a macOS Playwright e2e flow: set caret and scroll, restart, position restored

## 4. Function List (spec: function-list; design D3)

- [ ] 4.1 Write tests for the symbol extractor per language using fixtures (cpp, css, go, html, java, javascript/typescript, json, markdown, python, rust, sql, xml, yaml), then implement the Lezer node tables
- [ ] 4.2 Write tests for the regex fallback (SQL, YAML, languages without usable tree nodes), then implement
- [ ] 4.3 Implement the debounced refresh with a parse time budget that keeps the last complete list, with tests for tab and language changes
- [ ] 4.4 Implement the panel UI: kind and line number, filter box, empty state, click to jump with scroll into view
- [ ] 4.5 Add a macOS Playwright e2e flow: show the panel, filter, click to jump, visibility persists

## 5. Document Map (spec: document-map; design D4)

- [ ] 5.1 Write tests for the line-to-row downsampling and the viewport rectangle math, then implement
- [ ] 5.2 Write tests for the large-document cutoff (more than 50,000 lines or above the large-file threshold, and recovery on a small tab), then implement
- [ ] 5.3 Implement the canvas drawing with debounced redraw and drawing only while the panel is visible
- [ ] 5.4 Implement click and drag navigation that scrolls the editor
- [ ] 5.5 Add a macOS Playwright e2e flow: map visible, click scrolls the editor, large-file notice

## 6. Split view (spec: split-view; design D1; ADR-0005)

- [ ] 6.1 Write tests for the split-sync extension (edit in either pane, `remote` annotation prevents loops, selection mapping, shared dirty state), then implement
- [ ] 6.2 Write tests that undo and redo from either pane act on the primary history, then override the clone's undo and redo keys
- [ ] 6.3 Implement vertical and horizontal split layouts in the workspace layout with independent scroll per pane
- [ ] 6.4 Implement View > Split Vertically, Split Horizontally, Close Split and Move to Other Pane commands
- [ ] 6.5 Close the split on tab switch or tab close, and do not persist the layout in the session, with tests
- [ ] 6.6 Add a macOS Playwright e2e flow: split, type in the clone, undo from the other pane, close split

## 7. Macros (spec: macro-recording; design D2; ADR-0006, ADR-0002, ADR-0003)

- [ ] 7.1 Write tests for the macro model (step types, version field, serialization), then implement
- [ ] 7.2 Write tests for the Rust `macros.rs` store (atomic write, corrupt-file quarantine, missing file), then implement the Tauri commands and IPC client wrappers
- [ ] 7.3 Write tests for the recorder: typed and deleted text relative to the selection, command steps from the registry wrapper, Find/Replace options captured, non-recordable commands rejected with a toast, then implement
- [ ] 7.4 Write tests for playback: position independence, one undo step, unknown command id stops with a toast, recording and playback exclusive, then implement
- [ ] 7.5 Implement run multiple times (fixed count and until end of file), stopping on a failed step or when the caret cannot advance
- [ ] 7.6 Implement the Macro menu: Start/Stop Recording, Playback, Run Multiple Times, Save As, rename, delete and saved macros listed for playback
- [ ] 7.7 Add a macOS Playwright e2e flow: record, save, restart, play back

## 8. Verification and wrap-up

- [ ] 8.1 Run `npm run typecheck`, `npm test`, `cargo test` and `npm run test:e2e` and confirm all pass
- [ ] 8.2 Extend the manual checklist (`verification.md`) with items for native-shell behavior of the new UI on macOS and Windows
- [ ] 8.3 Update the README feature list and shortcuts for the new capabilities
- [ ] 8.4 Run `openspec validate add-missing-npp-windows-features --type change --strict` before archive
