## Why

Dragging a file from Finder onto next-notepad shows the "+" (copy) cursor but nothing opens: the app has no handler for files dragged in from the OS, and the macOS bundle declares no document types, so Finder will not offer the app for a Dock-icon drop or "Open With" either. Opening a file by drag and drop is basic text-editor behaviour, and the open path it needs (`openPath`, the Rust `RunEvent::Opened` queue) already exists from `open-files-from-cli`.

## What Changes

- Dropping one or more files anywhere on the window opens each as a tab, in drop order, with the last one active. Files already open are focused, not duplicated (existing `openFile` behaviour).
- Dropped folders are rejected with a notification worded like the CLI path ("cannot open /dir"); other files in the same drop still open.
- Drops go through the existing `app.openPath`, so the large-file warning and open-error handling match File → Open.
- Declare document types in the macOS bundle config as an **Alternate** handler for any file (catch-all), so files can be dropped on the Dock or app icon and chosen via "Open With", without next-notepad becoming the default app for any extension.
- Cover cold launch (app not running; the file is queued until the frontend is ready) and warm launch (app already running) for files arriving from Finder.
- No drop-target overlay. The browser host (dev server and e2e) ignores OS file drops; tests drive the drop through a platform seam.
- Out of scope: Windows and Linux file associations, becoming the default handler for any type, drop-target visual feedback.

## Capabilities

### New Capabilities
- `window-file-drop`: Dropping files from the OS onto the app window opens them as tabs (multi-file order, active tab, duplicates, folders rejected, shared open/large-file handling, Tauri only).
- `macos-document-types`: The macOS bundle declares an alternate catch-all document handler so Dock-icon drops and "Open With" open files, including cold-launch and warm-launch delivery.

### Modified Capabilities
<!-- None. `cli-open-files` (change open-files-from-cli, not yet archived) is reused unchanged; the Finder events feed its existing queue and handler. -->

## Impact

- Frontend (`notepad-next/src`): a drop listener on the Tauri webview, added to the `Platform` interface (`platform.ts`, `tauriPlatform.ts`, `browserHost.ts` no-op) and wired in `main.ts` to `app.openPath`; reuses `src/cli/openRequests.ts` error wording for folders.
- Tauri config (`src-tauri/tauri.conf.json`): macOS document types (Info.plist entries); window drag-drop setting confirmed enabled.
- Rust (`src-tauri/src/lib.rs`): the existing `RunEvent::Opened` handler is expected to work unchanged once the document types exist; cold/warm behaviour is verified, not rewritten.
- Tests: unit tests for the drop handler with a fake platform; Info.plist check on the built `.app`; manual checklist in `verification.md` (Dock drop, "Open With", cold and warm launch).
- Depends on: `open-files-from-cli` (queue, `cli_ready`, `OpenRequestHandler`).
- No new dependencies expected.
