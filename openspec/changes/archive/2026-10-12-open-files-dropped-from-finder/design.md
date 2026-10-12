## Context

Today a file dragged from Finder onto next-notepad shows the "+" cursor and nothing opens. Two separate gaps cause it:

1. **Window drop (frontend).** Tauri 2 delivers OS file drops as a webview drag-drop event carrying absolute paths. Nothing subscribes to it. The only drag code is tab reordering in `src/app/tabBar.ts`, which uses in-page `text/plain` data and never sees OS files.
2. **Dock drop and "Open With" (macOS bundle).** `src-tauri/tauri.conf.json` has no document types, so macOS does not treat the app as able to open files. The Rust side is already ready: `lib.rs` handles `RunEvent::Opened` and pushes the files into the queue that `OpenRequestHandler` drains (change `open-files-from-cli`, ADR-0009).

Existing pieces this design reuses:
- `App.openPath(path)`: focuses an already-open tab, shows the large-file warning, reads via the `open_file` command, sets the language.
- `Platform` interface (`platform.ts`): native services, backed by Tauri in `tauriPlatform.ts` and faked in `browserHost.ts` for unit and Playwright tests (ADR-0004).
- `app.notify(message, kind)`: toast used for errors.
- ADR-0002: the webview has no filesystem scope; all file access goes through Rust commands. A drop only yields paths, so reading stays in `open_file` and the capability file needs no new filesystem permission.

In-force ADRs: 0001 to 0009, none superseded. This design is coherent with all of them and proposes no supersession.

Assumption: diagrams are ASCII and lightweight C4-inspired (container view plus dynamic flows). The user chose ASCII and did not choose a rigor level.

### Containers (current state plus this change; `*` marks new or changed)

```
 +--------+  drag file   +----------------------------------------------------+
 | User / | -----------> |                  next-notepad.app                  |
 | Finder |  Dock drop   |                                                    |
 |        |  Open With   |  +-----------------------+   +------------------+  |
 +--------+      |       |  | Webview frontend (TS) |   | Rust backend     |  |
                 |       |  |                       |   |                  |  |
                 |       |  |  *fileDrop.ts         |   |  RunEvent::Opened|  |
                 |       |  |    |                  |   |   -> QueuedSink  |  |
                 |       |  |    v                  |   |        |         |  |
                 |       |  |  App.openPath <-------+---+- "open-request"  |  |
                 |       |  |    | (OpenRequest-    |   |   event (queued  |  |
                 |       |  |    |  Handler)        |   |   until cli_ready)  |
                 |       |  |    v                  |   |                  |  |
                 |       |  |  invoke open_file ----+-->|  files::open_file|  |
                 |       |  +-----------------------+   +------------------+  |
                 |       |                                                    |
                 +-----> |  *Info.plist document types (bundle config)        |
                         +----------------------------------------------------+
```

- Finder drops on the **window** are delivered by the webview as a drag-drop event and handled entirely in the frontend.
- Finder drops on the **Dock icon** and "Open With" are delivered by macOS to Rust as `RunEvent::Opened`, but only if the bundle declares document types.

## Goals / Non-Goals

**Goals:**
- Dropping files anywhere on the window opens each as a tab, in drop order, last one active.
- Dock-icon drops and "Open With" open files, on a cold start and in a running app.
- Same open behaviour as File → Open: focus existing tab, large-file warning, language detection.
- A folder in a drop gets a notification and does not stop the other files.
- Drop logic is unit-testable without Tauri.

**Non-Goals:**
- Windows and Linux file associations (argv handling already exists in `cli::parse`).
- Becoming the default app for any file type.
- Drop-target overlay or other visual feedback.
- Changing how `OpenRequestHandler` reports errors for the Dock path (see Risks).
- Dropping text or URLs, or dropping onto a specific pane or tab to change where the file opens.

## Decisions

### D1. Subscribe to the Tauri webview drag-drop event through a new `Platform` method

Add `onFilesDropped(handler: (paths: string[]) => void): Promise<() => void>` to `Platform`.
- `tauriPlatform` implements it with `getCurrentWebview().onDragDropEvent`, forwarding only `type === "drop"` payload paths.
- `browserHost` returns a no-op unsubscribe and exposes a test hook so tests can fire a drop.

Why: Tauri hides OS file paths from HTML5 `drop` events, so the webview event is the only source of real paths, and it works the same on macOS, Windows and Linux. Keeping it behind `Platform` follows the existing pattern (dialogs and clipboard) so unit and Playwright tests stay in plain WebKit (ADR-0004).

Alternatives considered:
- *HTML5 `drop` on `document`*: does not carry paths for OS files in Tauri (and Tauri's own drag-drop handling takes precedence when enabled). Rejected.
- *Rust-side window event and emit to the frontend*: duplicates what the webview API already does and adds a new event contract. Rejected.
- *A new `tauri-plugin-*` crate*: no new dependency is needed; `@tauri-apps/api` is already installed.

### D2. A small `fileDrop` module owns drop semantics, calling `App.openPath` per file

New `src/app/fileDrop.ts` takes the paths, opens them sequentially in order, and activates the last successfully opened one.
- Per-file `try/catch`: a failure (for example a directory, where `open_file` fails) calls `app.notify("cannot open <path>: <reason>", "error")` and the loop continues.
- `openPath` returning `null` (user declined the large-file warning) skips that file silently, matching File → Open.
- Opened sequentially, not in parallel, so tab order equals drop order and large-file prompts do not stack.
- After the loop, focus the editor (as `OpenRequestHandler` does).

Why not reuse `OpenRequestHandler.handle`: it returns on the first error (`handle` aborts the request) and reports errors to the Rust side, which has no one waiting for a window drop. We need continue-on-error plus a toast. Duplicating three lines of loop is cheaper than changing the CLI contract, which has its own specs and tests.

The folder wording matches the CLI path's `cannot open /dir`.

Alternative considered: pre-check directories with a new Rust command (`is_dir`) to give a clearer message. Rejected for now: `open_file` already fails on a directory, and the OS error text is acceptable; a new command widens the IPC surface for a cosmetic gain.

### D3. Leave Tauri's default drag-drop handling enabled

Do not set `dragDropEnabled: false` on the window; the default is what makes the webview event fire. The window drops cover the whole window (Q2) because the event is window-level, not element-level.

### D4. Declare macOS document types as an alternate catch-all handler

In the macOS bundle config, declare a document type with role Viewer or Editor and rank **Alternate**, covering any file (a catch-all content type), not a list of extensions and not default-handler rank.
- Alternate rank puts the app in "Open With" and accepts Dock drops without claiming default association for any extension.
- Catch-all because a text editor should accept any file, and a maintained extension list would drift from the `language-detection` spec.

The exact mechanism (Tauri `bundle.fileAssociations` with a content type, or a merged `src-tauri/Info.plist` with `CFBundleDocumentTypes`) is chosen at implementation after checking what the pinned Tauri version supports. Both end in the same `Info.plist` entry, which is what the verification checks.

### D5. Reuse `RunEvent::Opened` and the queue unchanged for cold and warm launch

No Rust change is planned. The queue (`QueuedSink`) holds requests until the frontend calls `cli_ready`, which covers a cold launch where `Opened` fires before the page loads; a warm launch delivers straight to the listener. The proposal's cold and warm scenarios become spec scenarios and manual checks, because a test cannot drive Finder.

### Dynamic flow: window drop (new)

```
 Finder        Webview (Tauri)     fileDrop.ts        App.openPath     Rust
   |  drop 2 files   |                  |                  |             |
   |---------------->| drag-drop event  |                  |             |
   |                 | {drop, paths[]}  |                  |             |
   |                 |----------------->| for each path:   |             |
   |                 |                  |----------------->| file_size   |
   |                 |                  |                  |------------>|
   |                 |                  |                  | open_file   |
   |                 |                  |                  |------------>|
   |                 |                  |<-- tab id / null |   (error ->  |
   |                 |                  | notify on error  |    toast,    |
   |                 |                  | continue         |    next file)|
   |                 |                  | activate last    |             |
```

### Dynamic flow: Dock drop / Open With (existing code, new bundle config)

```
 Finder/Dock    macOS             Rust (lib.rs)        Webview
   | drop on icon  |  needs document types (D4)
   |-------------->| RunEvent::Opened{urls}
   |               |------------------>| QueuedSink.open(0, files)
   |               |                   |  cold: held until cli_ready
   |               |                   |-- "open-request" event ------> OpenRequestHandler
   |               |                   |                              -> App.openPath per file
```

## Risks / Trade-offs

- **[Drag-drop handling interferes with tab drag-reorder]** On some platforms Tauri's native drag-drop handling swallows in-page HTML5 drags. -> Check the tab reorder on macOS (e2e) and manually; the reorder uses `text/plain` data and only ever has to work on macOS right now.
- **[Dock path aborts on first bad file]** `OpenRequestHandler.handle` stops at the first error, so a Dock drop mixing a folder and files opens only the files before the failure. -> Out of scope; noted so a later change can align it with D2.
- **[Document types only apply to a built `.app`]** `tauri dev` does not apply the bundle's `Info.plist`, and macOS caches association data (Launch Services). -> Verify with a built bundle and the Info.plist check; the manual checklist says to rebuild and, if needed, re-register the app.
- **[Catch-all may list the app for binary files]** "Open With" will offer the app for any file. -> Accepted; large-file and binary handling already exist in the open path.
- **[Duplicate opens]** Dropping the same file twice quickly. -> `openPath` focuses the existing tab, so no duplicate is created; sequential opens avoid the race.
- **[Cannot test Finder]** Dock and "Open With" cannot be driven by unit or Playwright tests. -> Info.plist assertion on the built bundle plus a manual checklist in `verification.md`.

## Migration Plan

No data or settings migration. Ship in the next macOS build. Rollback: remove the document type entry and the drop subscription; there is no persisted state.

## Open Questions

- Which mechanism does the pinned Tauri version support for a catch-all macOS document type: `fileAssociations` with a content type, or a merged `Info.plist`? Decided at implementation by inspecting the built bundle (D4).
- Does the existing tab drag-reorder keep working with Tauri's drag-drop event on macOS? Verify in implementation (first risk above).
- No in-force ADR needs revisiting. The adr step records one new ADR, for the alternate catch-all document handler stance (D4); D1 and D2 are tactical and follow the existing `Platform` seam.
