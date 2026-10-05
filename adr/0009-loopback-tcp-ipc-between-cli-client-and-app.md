---
status: "accepted"
date: 2026-10-06
decision-makers: mariswamypillai
consulted: none
informed: none
---

# Use a loopback TCP server and a token file for the command-line client to talk to the running app

Supersedes: none

## Context and Problem Statement

Tools such as `kubectl edit` run `$KUBE_EDITOR <file>` and wait for that process to exit. next-notepad is a single-window GUI app, so a command-line invocation must hand the file to the running instance and then stay alive until the user is done with it, on macOS and Windows. The inter-process channel chosen here will also carry later requests from other tools, so it is a long-lived boundary of the app.

## Decision Drivers

- The client must be able to wait, so it cannot be a process that forwards its arguments and exits
- The same mechanism on macOS, Windows and Linux, with little platform-specific code
- Not reachable by other machines, and not usable by other users of the same machine
- Robust to crashes: no stale state that blocks the next start

## Considered Options

- A loopback-only TCP server on an ephemeral port, with the port and a random token in an owner-only file in the app-data directory
- Tauri's single-instance plugin
- A Unix domain socket and a Windows named pipe
- A file-based protocol (request and completion marker files that both sides poll)

## Decision Outcome

Chosen option: "a loopback TCP server with a token file", because it needs one implementation for every platform, supports a long-lived waiting connection, and stale state is harmless: a refused connection simply means the app is not running, and the next start overwrites the file. The protocol is one JSON object per line, limited to 1 MiB, with a token check on every request. The same binary is the client (no arguments starts the GUI), so only one executable is built, signed and installed.

### Consequences

- Good, because the client and server are plain `std::net` code that can be unit-tested over loopback without a window or a display.
- Good, because the same channel can be reused for future requests from other tools.
- Bad, because a local process running as the same user can read the token file and connect; that user can already run code as themselves, so this is accepted.
- Bad, because a port is open on loopback while the app runs, so the token check and the 1 MiB and 5 second limits are part of the contract.

### Confirmation

Confirmed by Rust tests for the protocol, the server (wrong token, malformed and oversized input, queued requests, wait and finish) and the client (stale file, refused connection, dropped connection), a frontend test for the open-request handler, and the `cli-open-files` spec scenarios.

## Pros and Cons of the Options

### Loopback TCP with a token file

- Good, because it is portable, testable and supports waiting.
- Bad, because it opens a local port.

### Tauri's single-instance plugin

- Good, because it is ready made.
- Bad, because the second process exits immediately, so it cannot implement `--wait`.

### Unix socket and named pipe

- Good, because there is no network port.
- Bad, because two implementations and two test paths are needed.

### File-based protocol

- Good, because it needs no port.
- Bad, because polling adds latency, and crash and cleanup handling is harder.

## More Information

See `openspec/changes/open-files-from-cli/design.md` decisions D2 to D5.
