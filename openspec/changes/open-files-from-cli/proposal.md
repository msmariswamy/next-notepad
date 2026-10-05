## Why

next-notepad cannot be the editor for tools that run `$EDITOR <file>` and wait for it to exit, such as `kubectl edit`, `git commit` and `crontab -e`. It ignores command-line arguments, cannot bring an already-running window forward, and has no way to say "I am done with this file". `kubectl edit cm <name>` is the immediate need, and it benefits from the new YAML tools.

## What Changes

- Add a command: `next-notepad [--wait | -w] <file>...`, plus `--help` and `--version`. The same binary acts as a thin client when it is given arguments and never creates a window or Dock icon in that mode.
- Add a loopback-only TCP server inside the app. It writes `cli-server.json` (port, token, pid) in the app-data directory with owner-only permissions and removes it on a clean exit. Requests without the right token are rejected.
- The client sends one JSON line `{token, files, wait, cwd}` with absolute paths and reads `{ok}`, then `{done}` in wait mode, or `{error}`. If the app is not running the client starts it detached, waits a few seconds for the server, and then sends the request.
- In wait mode the command exits only when every requested file's tab is closed or the app quits. A normal quit finishes pending waits (exit 0); a dropped connection exits 1. Exit codes: 0 success, 1 other failure, 2 usage error, 3 app could not be started or reached.
- Opening: a path that does not exist opens an empty tab bound to that path, an already-open file is just focused, and several files in one command all open. Every request shows and focuses the window. Requests that arrive before the window is ready are queued, not lost.
- macOS: `open -a next-notepad file` and dropping a file on the Dock icon open the file through the same path (no waiting).
- Windows: the client attaches to the parent console so help, version and errors appear in the terminal that ran the command.
- Add Help > "Command Line Tool…": on macOS an Install button creates a `next-notepad` symlink (in `/usr/local/bin` if writable, otherwise `~/.local/bin`) and reports the result and any PATH hint; on both platforms it shows a ready-to-paste `KUBE_EDITOR` line (shell, PowerShell or `setx` form) with a copy button.
- One small Windows-only crate (`windows-sys`) for the console attach. No **BREAKING** changes.

Out of scope: `file:line` syntax, registering as the default app for file types, editing the Windows `PATH` from the installer, and a new window per request.

## Capabilities

### New Capabilities
- `cli-open-files`: the `next-notepad` command, the local server, the request protocol, wait mode, startup of the app, queued and macOS open requests, and exit codes.
- `cli-install`: the Help dialog that installs the command on macOS and shows `KUBE_EDITOR` setup text for macOS and Windows.

### Modified Capabilities
<!-- None: no existing requirement changes meaning. Opening a file uses the existing open path. -->

## Impact

- `notepad-next/src-tauri/src/`: new `cli` (arguments, client), `cli_server` (server, protocol) and install modules; `lib.rs` and `main.rs` start-up; new Tauri commands; `Cargo.toml`.
- `notepad-next/src/`: an open-request handler with wait tracking, quit hook, and the Help dialog.
- Tests: Rust unit tests for argument parsing, the protocol, the server and the client over loopback; frontend unit tests for request handling and wait tracking; a macOS Playwright flow driven by a simulated open request.
- Behavior that cannot be automated (a real `kubectl edit`, the Windows console) goes into a manual checklist.
