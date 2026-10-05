# Verification (task 8.2)

Every requirement in `specs/` has automated coverage: Rust tests for the arguments, protocol, server, client and installer
(`cargo test`), Vitest for the open-request handling, wait tracking, dialog and `KUBE_EDITOR` text, and WebKit end-to-end flows
driven by a simulated request (`npm run test:e2e`). On top of that, the **real binary** (debug build with the frontend
embedded, run against a throwaway `HOME`) was exercised on macOS:

- `next-notepad --version`, `--help` and an unknown flag (exit 2).
- `next-notepad --wait file.yaml` with the app closed: the app started detached, `cli-server.json` was written with mode 0600,
  the command stayed running, and the session afterwards listed the file as a YAML tab.
- A second `next-notepad other.txt` returned exit 0 in about 50 ms and opened the file.
- Killing the app made the waiting command print "closed before you finished editing" and exit 1.
- The stale `cli-server.json` left by that kill was ignored: the next command started a new app and was served.

## Not covered by an automated test

- **A real `kubectl edit`.** `KUBE_EDITOR="next-notepad --wait" kubectl edit cm <name>` was not run (no cluster here). The
  command line it produces (`next-notepad --wait /tmp/kubectl-edit-XXXX.yaml`) was.
- **A normal quit finishing waits (exit 0) on the real app.** The frontend path (`finishAll` before quit) is tested in the
  browser harness and the Rust `finish_all` in unit tests, and the Rust `Exit` event calls it too, but a real Cmd+Q was not driven.
- **Windows:** the console attach (`AttachConsole`, with output written to `CONOUT$` when the standard handles are null), the
  `DETACHED_PROCESS` spawn and the `cmd /C` quoting that `kubectl` uses could not be built or run on macOS; the code is small and `cfg`-gated and CI builds Windows.
- **macOS open events:** `open -a next-notepad file` and Dock drops use `RunEvent::Opened`, which only a real app receives.
- **Clicking Install** in the real app writes into `/usr/local/bin` or `~/.local/bin`; it is tested against temporary folders.

## Spec deviations (intentional)

- The server file path is computed without Tauri (so the client can find it without starting an app) and matches Tauri's
  app-data directory for the bundle identifier; a unit test compares the identifier with `tauri.conf.json`.
- Requests from macOS open events use id 0 and are never waited on; the frontend treats them like any other request.
- A request that finds the file already open waits on that tab, as the spec says; two commands waiting on one file finish together.

## Manual checklist (real app, before each release)

- [ ] **kubectl edit:** `export KUBE_EDITOR="next-notepad --wait"` (or the line from Help > Command Line Tool…), then
  `kubectl edit cm <name>`. The YAML opens in next-notepad; edit, save, close the tab: `kubectl` applies the change.
  Repeat, but close the tab without saving: `kubectl` reports that the edit was cancelled.
- [ ] **Quit while waiting:** with a `--wait` command running, quit next-notepad from the menu or Cmd+Q: the command exits 0.
- [ ] **git commit:** `GIT_EDITOR="next-notepad --wait" git commit` opens the message file and returns after you close it.
- [ ] **App closed:** quit next-notepad, then run `next-notepad file.txt`: the app starts and opens the file in front.
- [ ] **Window focus:** minimize the window and run `next-notepad file.txt`: the window is restored and focused.
- [ ] **macOS Install:** Help > Command Line Tool… > Install command creates the link, and `next-notepad --version` works in a new terminal.
- [ ] **macOS open:** `open -a next-notepad file.txt` and dragging a file onto the Dock icon open the file.
- [ ] **Windows:** from PowerShell and from cmd, `next-notepad.exe --help` prints in the terminal, and `kubectl edit` works with the
  `KUBE_EDITOR` line from the dialog.
