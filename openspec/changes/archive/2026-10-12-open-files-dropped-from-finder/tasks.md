## 1. Drop handling (spec: window-file-drop; design D2)

- [x] 1.1 Write tests for `src/app/fileDrop.ts` with a fake app (paths open in drop order and the last opened tab is activated; an already-open file is focused and not duplicated, including the same path twice in one drop; a path that fails to open shows `cannot open <path>` with the reason and the loop continues; a declined large-file prompt (`openPath` returns `null`) is skipped with no error), then implement it
- [x] 1.2 Write a test that a drop containing only failures leaves the active tab unchanged and the editor focus intact, and that focus returns to the editor after a drop that opened something, then adjust the handler

## 2. Platform seam (spec: window-file-drop; design D1; ADR-0002, ADR-0004)

- [x] 2.1 Add `onFilesDropped(handler): Promise<() => void>` to the `Platform` interface in `src/app/platform.ts`
- [x] 2.2 Implement it in `src/app/tauriPlatform.ts` with the webview drag-drop event, forwarding only `drop` events with their paths; check that `core:default` already covers the event listener so `capabilities/default.json` needs no new permission, and keep the webview free of filesystem scope
- [x] 2.3 Implement the browser host version in `src/app/browserHost.ts`: a no-op subscription plus a test hook that fires a drop, so unit and Playwright tests can drive it; OS file drops on the plain page open nothing
- [x] 2.4 Update the test platform fakes that implement `Platform` so the suite still type-checks

## 3. Wiring (spec: window-file-drop; design D1, D3)

- [x] 3.1 In `src/main.ts`, subscribe through `platform.onFilesDropped` and pass the paths to `fileDrop`, using `app.notify` for errors; unsubscribe on teardown
- [x] 3.2 Confirm `tauri.conf.json` leaves the window's drag-drop handling at its default (enabled) and note it with a comment in the config's neighbour docs if the file cannot hold comments

## 4. macOS document types (spec: macos-document-types; design D4, D5; ADR-0010)

- [x] 4.1 Find out which mechanism the pinned Tauri version supports for a catch-all macOS document type with alternate rank (`bundle.fileAssociations` with a content type, or a merged `src-tauri/Info.plist` with `CFBundleDocumentTypes`), and record the choice as a comment or in `verification.md`
- [x] 4.2 Declare the catch-all document type with alternate rank in the bundle config; do not declare any file type as default
- [x] 4.3 Add a script or test that builds the macOS bundle (or reads its generated `Info.plist`) and fails unless it contains the catch-all document type with alternate rank
- [x] 4.4 Check in code that the macOS `RunEvent::Opened` path goes through the same sink that shows, restores and focuses the window (design D5); change Rust only if it does not

## 5. End-to-end flows (ADR-0004: Playwright WebKit on macOS)

- [x] 5.1 Add a Playwright flow driven by the browser-host drop hook: one file opens, several files open in order with the last active, an open file is focused and not duplicated, and a missing or unreadable path shows the error without stopping the rest
- [x] 5.2 Add a Playwright flow that a real OS file drop on the plain browser page opens no tab
- [x] 5.3 Add or confirm a Playwright flow that dragging a tab to a new position still reorders the tabs and opens no file (spec: tab reordering keeps working)

## 6. Verification and wrap-up

- [x] 6.1 Run `npm run typecheck`, `npm test`, `cargo test` and `npm run test:e2e` and confirm all pass
- [ ] 6.2 Build the macOS `.app` and run the real checks: drag one and several files from Finder onto the window, drop a folder, drop a file that is already open, drag tabs to reorder, and confirm the "+" cursor now opens the file
- [ ] 6.3 With the built `.app`, check Dock-icon drop and "Open With" while running, a cold launch and a warm launch with a minimized window, and that a `.txt` file's default application is unchanged; if Launch Services has stale data, re-register the app and retry
- [x] 6.4 Write `verification.md` for this change: the Info.plist check result, the chosen document-type mechanism, the manual checklist above with results, and the known gaps (Windows and Linux associations and drops, the Dock path stopping at its first bad file)
- [x] 6.5 Update the README with drag and drop from Finder and the macOS "Open With" and Dock behaviour
- [x] 6.6 Run `openspec validate open-files-dropped-from-finder --type change --strict` before archive
