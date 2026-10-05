## Why

next-notepad covers the core of Notepad++ (editing, tabs, session restore, Find/Replace, JSON tools, line operations) but still lacks its most visible Windows features: macros, split view, Function List and Document Map, all of which the existing design defers. Base64 encode/decode is also a commonly used text transform that is missing. Closing these gaps now makes next-notepad a credible daily-driver replacement on macOS and Windows.

## What Changes

- Add macro recording and playback (typing, edits, Find/Replace and menu commands), with named macros saved as versioned JSON in app data and run-N-times / run-until-end-of-file playback.
- Add split view: vertical or horizontal panes, live-synced clones (shared document and undo history), independent cursor and scroll per pane, move-to-other-pane and close-split commands.
- Add a right-docked Function List panel with click-to-jump and a filter box, parsed from the Lezer syntax tree with a regex fallback for languages lacking a grammar (covers the 13 supported languages).
- Add a right-docked Document Map (canvas minimap) with viewport highlight and click/drag-to-scroll, automatically disabled above about 50k lines (or the 50 MB warning size) with a status notice.
- Restore cursor and scroll position on session restore via optional new `session.json` fields; undo history is not restored.
- Add Edit → Base64 commands: Encode and Decode in standard and URL-safe variants, acting on the selection (or whole document if none), per-selection for multi-caret, UTF-8, invalid input shows a toast and is never modified, one undo step per operation.
- Persist Function List and Document Map visibility in settings, toggled from the View menu.
- Both macOS and Windows are supported. No **BREAKING** changes: `session.json` new fields are optional, so older sessions still load.

Out of scope: plugin system, Windows shell integration and registry settings, compare/diff, auto-completion, Run menu, print/export, undo-history restore, OS-level multi-instance handling.

## Capabilities

### New Capabilities
- `macro-recording`: record, play back and save named macros of typing, edit, Find/Replace and menu commands.
- `split-view`: two-pane vertical/horizontal split with live-synced document clones and per-pane cursor and scroll.
- `function-list`: right-docked, filterable, click-to-jump outline of functions, classes and headings per document.
- `document-map`: right-docked canvas minimap with viewport highlight, click/drag scrolling and a large-file cutoff.
- `base64-transform`: Base64 and URL-safe Base64 encode/decode of selections or whole documents.

### Modified Capabilities
- `session-restore`: the "text content only" requirement changes so cursor and scroll position are also restored, backward-compatible with existing sessions.
- `view-options`: adds View-menu toggles for the Function List and Document Map panels, persisted in settings.

## Impact

- `notepad-next/src/`: editor, menu and command registry, new side panels, split layout, macro recorder, settings.
- `notepad-next/src-tauri/`: macro file persistence, settings, and session read/write (optional view-state fields).
- Dependencies: none heavy; Lezer ships with CodeMirror 6.
- Tests: Vitest unit tests per capability, cargo tests for new Rust persistence, macOS Playwright e2e for the new UI.
- Existing specs touched: `session-restore` and `view-options` (in `openspec/specs/`).
