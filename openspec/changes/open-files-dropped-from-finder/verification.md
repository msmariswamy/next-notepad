# Verification (task 6.4)

Automated: Vitest (`fileDrop`, the browser-host hook, the Info.plist checks), `cargo test` (the early-open buffer), and WebKit
end-to-end flows for the window drop (`e2e/file-drop.spec.ts`) including that dragging a tab still reorders tabs.

## Document-type mechanism (task 4.1)

Tauri 2 merges a file named `src-tauri/Info.plist` into the bundle's `Info.plist` automatically, so the declaration lives in
that file (`CFBundleDocumentTypes`, one entry named "Any file": `public.data`, extension `*`, role Editor,
`LSHandlerRank` Alternate). It was **not** done through `bundle.fileAssociations`, which has no way to say "Alternate".
`npm run check:plist` reads the built bundle's `Info.plist` and fails unless the catch-all type is present with Alternate rank
and nothing declares Owner or Default rank. Result on the 0.2.1 build:
`catch-all document type with Alternate rank, no default claims`. The same rule is unit-tested on the source file.

## Checked on the real built app

- **Cold launch from the OS with two files:** `open -n --env HOME=<throwaway> -a next-notepad.app a.txt b.yaml` started a new
  instance that opened both files as tabs, detected `b.yaml` as YAML and left the last file active.
- **A bug this found, now fixed:** before the fix the same command opened nothing. macOS can deliver the "open file" event before
  `setup` has created the app state, and the handler dropped it because the state did not exist yet. Early files are now held
  in `EarlyOpens` (Rust, unit-tested) and handed to the existing queue as soon as setup finishes.

## Not covered by an automated test

- **A real drag from Finder onto the window.** Tauri delivers it as a webview drag-drop event; only the desktop app receives it,
  and no test can drive Finder. The handler is tested through the platform seam.
- **Tab drag-reorder inside the real Tauri webview.** The browser test passes; whether Tauri's native drag-drop handling
  interferes inside the app is on the manual checklist.
- **Dock-icon drop, "Open With", warm launch with a minimized window, and the default application staying unchanged.** These
  need Finder and Launch Services. A warm `open` was not run because it would go to whichever instance of the app was already
  running, including a normal installed copy.
- **Windows and Linux** file drops and associations (out of scope for this change).

## Known gaps

- A Dock or "Open With" delivery of several files stops at the first one that cannot be opened (the command-line request
  handler aborts on its first error); a window drop continues past failures. Noted in the design.
- Launch Services caches association data. After installing a new build, if "Open With" does not list the app, run
  `/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -f /Applications/next-notepad.app` and retry.
- `tauri.conf.json` is plain JSON and cannot hold a comment: the window's drag-drop handling is deliberately left at its
  default (enabled), which is what makes the drop event fire. Do not set `dragDropEnabled` to `false`.

## Manual checklist (built app, macOS; tasks 6.2 and 6.3)

- [ ] Drag one file from Finder onto the window: the cursor no longer shows "+" without effect and the file opens in a tab.
- [ ] Drag three files at once: three tabs open in order and the last is active.
- [ ] Drop a folder: a "cannot open" message names it and nothing else breaks. Drop a folder together with files: the files open.
- [ ] Drop a file that is already open: its tab is focused and no duplicate appears.
- [ ] Drag tabs to reorder them: it still works and no file opens.
- [ ] Drop a file onto the Dock icon while the app runs: it opens in a tab and the window comes forward.
- [ ] Right-click a `.txt` file in Finder > Open With: next-notepad is listed. Double-click the same file: the application that
  opened it before still opens it (next-notepad did not become the default).
- [ ] With the app closed, drop a file on its icon in Finder (cold launch): the app starts and the file opens.
- [ ] With the window minimized, open a file with next-notepad from Finder (warm launch): the window is restored and the file opens.
