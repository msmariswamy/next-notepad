# Verification (task 8.2)

Every requirement in `specs/` has automated coverage: Vitest (`npm test`), `cargo test`, and WebKit end-to-end
(`npm run test:e2e`). This file lists what those suites **cannot** show, and the manual checks to run in the real
app (`npm run tauri dev`) on macOS and, when its builds are available, on Windows. It extends the checklist the earlier
change archived at `openspec/changes/archive/2026-10-05-macos-flutter-notepad/verification.md`.

## Not covered by an automated test

- **Document Map above 50,000 lines (e2e):** typing 50,000 lines through Playwright's `insertText` takes over 90 seconds
  in WebKit, so the cutoff is asserted at unit level only (`src/documentmap/geometry.test.ts`, `panel.test.ts`): the
  50,001-line and large-file-threshold cases both show the notice, and a small tab draws the map again.
- **Canvas pixels:** the minimap's drawing is not compared pixel by pixel; the e2e checks the highlight geometry and that
  click and drag scroll the editor.
- **Persistence across a real restart of the shell:** the browser harness stores settings in memory and the session and
  macros in `localStorage`. The Rust round-trips, corrupt-file quarantine and older-file loading are `cargo test`s.
- **Windows:** the new UI has unit tests and CI, but no Windows end-to-end run (ADR-0004 keeps e2e macOS-only for now).

## Spec deviations (intentional)

- Macro recording captures caret-movement keys (arrows, Home/End and so on) as `key.<name>` steps. The spec lists typing,
  commands and Find/Replace; without movement a macro could not do anything useful across lines.
- A macro Find step that finds nothing stops the run and shows a toast even in "run until end of file" mode, as the spec
  scenario "A step failure stops the run" asks.
- Mouse clicks that move the caret are not recorded, and edits made with several carets at once are not recorded.

## Manual checklist (real app, before each release)

- [ ] **Macro file on disk:** record and save a macro, quit, and confirm `macros.json` exists in the app-data directory
  with `"version": 1`. Replace it with invalid JSON, relaunch: the app starts, the Macro menu lists no saved macros, and
  `macros.json.corrupt` holds the bad file.
- [ ] **Macro undo:** Cmd+Z / Ctrl+Z after a playback undoes the whole playback in one press.
- [ ] **Split view:** split vertically and horizontally in the real window, drag the window smaller and larger, type in
  both panes, undo from each; close the split and confirm the cursor returns to the main pane.
- [ ] **Function List and Document Map:** show both, resize the window, switch tabs and languages, scroll a long file and
  watch the highlight; open a file over 50,000 lines and confirm the map shows its notice and typing stays smooth.
- [ ] **Cursor and scroll restore:** open a long file, scroll and place the caret, quit, relaunch: the caret and scroll
  position are back. Edit the file externally to be shorter, relaunch: no error and the caret is clamped.
- [ ] **Base64:** encode and decode with the clipboard round-trip to another app; decode text copied from a base64 tool
  with line breaks.
