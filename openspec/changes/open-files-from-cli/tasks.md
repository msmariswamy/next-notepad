## 1. Arguments and protocol (spec: cli-open-files; design D1, D3)

- [x] 1.1 Write tests for argument parsing in `src-tauri/src/cli.rs` (no arguments means GUI, ignoring `-psn_`; files; `--wait` and `-w`; `--help`; `--version`; unknown flag and `--wait` without files are usage errors), then implement it
- [x] 1.2 Write tests for the protocol types in `src-tauri/src/protocol.rs` (request and response lines round-trip, unknown fields ignored, the 1 MiB line limit, relative paths resolved against `cwd`), then implement it

## 2. Server (spec: cli-open-files; design D2, D5)

- [x] 2.1 Write tests for the server file (written with port, token and pid; owner-only permissions on Unix; removed on a clean shutdown; a token from the OS random source), then implement `cli_server.rs` start and shutdown
- [x] 2.2 Write tests for request handling over loopback (right token gets `{ok}`; wrong token, malformed JSON and an oversized line get `{error}`; a slow first line times out; the listener is bound to 127.0.0.1 only), then implement the accept loop
- [x] 2.3 Write tests for the wait lifecycle (`{done}` after finish, `finish_all` on quit, a request without `wait` closes after `{ok}`, a dropped client is cleaned up), then implement the pending-request table
- [x] 2.4 Write tests for queueing (requests before `ready` are held and delivered in order after it), then implement the queue behind a sink trait

## 3. Client (spec: cli-open-files; design D1, D4, D8)

- [x] 3.1 Write tests for the client against an in-process server (opens files, waits for `done`, prints `error` to standard error with exit 1, exit 2 for usage, exit 1 when the connection drops before `done`), then implement `run_client`
- [x] 3.2 Write tests for finding the server (missing file and a refused connection both mean "not running"; a stale file is tolerated), then implement the lookup
- [x] 3.3 Implement starting the app detached when it is not running, polling up to 10 seconds, with exit 3 when it cannot be reached; test the polling and timeout with a fake spawner
- [x] 3.4 Add the Windows-only console attach with the `windows-sys` crate behind `cfg(windows)`, and confirm macOS builds are unaffected

## 4. App wiring (spec: cli-open-files; design D5, D7)

- [x] 4.1 Wire `run()` and `main.rs`: arguments mean client mode and exit before any Tauri code; start the server in `setup`; register the Tauri commands `cli_ready`, `open_request_opened`, `finish_open_request` and `finish_all_open_requests`; remove the server file on exit
- [x] 4.2 Implement the Tauri sink: emit `open-request`, and show, un-minimize and focus the main window on every request
- [x] 4.3 Handle the macOS opened-files run event through the same sink with no waiting, behind `cfg(target_os = "macos")`

## 5. Frontend handling (spec: cli-open-files; design D5, D6)

- [x] 5.1 Write tests for the open-request handler in `src/cli/openRequests.ts` (opens each path, reports success or the first error, focuses an already-open file, opens a missing path as an empty tab bound to it), then implement it
- [x] 5.2 Write tests for wait tracking (finishes when all opened or focused tabs are closed, partial closes keep waiting, finishes every pending request on quit, several concurrent requests), then implement it
- [x] 5.3 Wire it in `main.ts`: listen for `open-request`, call `cli_ready` once the listener is registered, finish pending waits before quitting, and add a browser-host hook to simulate a request in tests

## 6. Command Line Tool dialog (spec: cli-install; design D9)

- [x] 6.1 Write tests for the `KUBE_EDITOR` text builder (shell, PowerShell and `setx` forms; quoting of paths with spaces; the installed `next-notepad` form), then implement it
- [x] 6.2 Write Rust tests for the installer in `src-tauri/src/install_cli.rs` (symlink into a writable folder, fallback to `~/.local/bin`, replace its own old link, refuse to overwrite a regular file, report whether the folder is on `PATH`), then implement it and the `cli_info` and `install_cli_command` Tauri commands
- [x] 6.3 Implement Help > Command Line Tool… with the path, the settings text with copy buttons, and the Install button on macOS only, with a registry test and a toast on copy

## 7. End-to-end flows (ADR-0004: Playwright WebKit on macOS)

- [x] 7.1 Add a Playwright flow driven by a simulated open request: the file opens and is focused, an open file is focused rather than duplicated, a missing path opens an empty tab, and the dialog shows the `KUBE_EDITOR` text
- [x] 7.2 Add a Playwright flow for waiting: the simulated request is pending until its tab is closed, closing one of two tabs keeps it pending, and quitting finishes it

## 8. Verification and wrap-up

- [x] 8.1 Run `npm run typecheck`, `npm test`, `cargo test` and `npm run test:e2e` and confirm all pass, and run a real end-to-end check with the built binary against a running app on macOS
- [x] 8.2 Write `verification.md` for this change: the known gaps (the Windows console attach and spawn flags, a real `kubectl edit`) and a manual checklist
- [x] 8.3 Update the READMEs with the command, `--wait`, the install dialog and the `KUBE_EDITOR` setup
- [x] 8.4 Run `openspec validate open-files-from-cli --type change --strict` before archive
