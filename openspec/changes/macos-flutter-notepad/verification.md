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
