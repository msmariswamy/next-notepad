# Verification (task 12.1)

Every requirement in `specs/` is exercised by automated tests: Vitest (`npm test`), `cargo test`, and WebKit end-to-end
(`npm run test:e2e`). Scenario-to-test mapping is by name; the lists below are the **known gaps**, i.e. behaviour that is
implemented but not covered by an automated test, or that cannot be covered without the real Tauri shell.

## Not testable in the browser harness (needs the real app)

- Tauri IPC `Channel` streaming for Find in Files, native open/save/folder dialogs, system clipboard permission, and the
  window `close-requested` quit flow. The Rust side (`find_files`, `session`, `settings`, `files`) is unit-tested and the
  frontend is tested against the same interface with fakes.
- Real filesystem permissions and symlink behaviour on Windows.
- Windows and Linux builds and test runs (CI is configured for macOS only for now; see `.github/workflows/notepad-next.yml`).

## Implemented, covered only at unit level (no end-to-end test)

- Tab drag-and-drop reordering (`DocumentManager.move` is unit-tested; the drag events are not driven in WebKit).
- Column (rectangular) selection by Alt-drag and multi-caret by Cmd-click: verified through CodeMirror's API in unit tests.
- Code folding by clicking the gutter: a fold range is asserted, the click is not.
- Find dialog transparency on window blur: the opacity function is unit-tested; real focus loss is not driven.
- Random case / randomize lines: only invariants (same letters / same lines) are asserted, by design.
- Locale sort order is asserted for one locale-independent case only.

## Spec deviations (intentional)

- JSON formatting keeps number text and key order exactly as written (spec text updated); duplicate keys still collapse.
- Menu bar is in-page, not the native macOS menu.
- Silent-close recently-closed list is stored but has no UI yet.

## Manual checklist (run in the real app: `npm run tauri dev`, before each release)

These cannot be driven by the browser harness. Tick each on macOS; repeat on Windows/Linux when those ship.

- [ ] **Quit flow:** type in two untitled tabs, press Cmd+Q. With *Close without prompting* off, a Save / Don't Save / Cancel prompt appears per modified tab; Cancel keeps the app open. With it on, the app quits silently and the tabs return on relaunch.
- [ ] **Crash recovery:** type text, wait 3 seconds, force-quit the app (Activity Monitor), relaunch: the text is back.
- [ ] **Open / Save As / Open Folder:** the native dialogs open, a saved file appears on disk with the chosen encoding and line ending, and Open Folder sets the Find in Projects root.
- [ ] **Large file:** open a file over 50 MB: a warning asks before loading.
- [ ] **Find in Files:** search a real folder (a few hundred files): results stream in, Cancel stops the search, a lookahead pattern (`foo(?=bar)`) works, binary files are skipped.
- [ ] **Replace in Files:** the confirmation shows the file count; after confirming, files on disk change and keep their line endings and BOM.
- [ ] **Clipboard:** Cut, Copy and Paste in the Edit menu and Bookmark > Cut/Copy/Paste work with other apps; no permission prompt blocks them.
- [ ] **Tab drag:** drag a tab to reorder; the order survives a relaunch.
- [ ] **Column selection and multi-caret:** Option-drag selects a column; Cmd-click adds carets.
- [ ] **Code folding:** click the gutter arrow on a JSON object to fold and unfold it.
- [ ] **Dialog transparency:** with *On losing focus* on, click the editor: the Find dialog turns translucent; click it again: opaque.
- [ ] **Missing file:** save a file, close the app, delete the file, relaunch: the tab shows the warning and keeps its text.
- [ ] **Icon and name:** the Dock and the window show *next-notepad* and the new icon.
