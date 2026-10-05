---
status: "accepted"
date: 2026-10-05
decision-makers: mariswamypillai
consulted: none
informed: none
---

# Rust backend owns the filesystem and session store

Supersedes: none

## Context and Problem Statement

In a Tauri app the frontend can reach the disk directly through JavaScript plugins, or all file access can go through backend commands. The choice sets the security surface, where session persistence and file search live, and how those parts can be tested. The app must also never lose unsaved text, which needs atomic writes and crash-safe persistence.

## Decision Drivers

- Small permission surface for the webview
- Testability of file I/O, search and persistence without a UI
- Crash-safe, atomic session writes
- Fast directory walking and search for Find in Files

## Considered Options

- Rust commands own all filesystem access, session store and file search
- Frontend uses the Tauri fs plugin directly
- Hybrid: frontend reads and writes files, backend only searches

## Decision Outcome

Chosen option: "Rust commands own all filesystem access, session store and file search", because it keeps the webview unprivileged, makes persistence and search testable with `cargo test`, and puts atomic writes in one place.

### Consequences

- Good, because the webview needs no broad filesystem capability.
- Good, because atomic write, encoding detection and the walker are unit-tested in Rust.
- Good, because Find in Files can scale to large directories.
- Bad, because every file operation needs a typed command and IPC wrapper.
- Bad, because large payloads cross the IPC boundary, so chunking or streaming is required.

### Confirmation

Confirmed by Tauri capability configuration that grants the webview no direct filesystem scope, and by `cargo test` suites for the session store, walker and encoding detection.

## Pros and Cons of the Options

### Rust commands own everything

- Good, because security surface is minimal and logic is testable.
- Bad, because there is more IPC plumbing.

### Frontend uses the fs plugin

- Good, because it is less code.
- Bad, because it widens webview capabilities and spreads persistence logic across the TypeScript code.

### Hybrid

- Good, because only search needs Rust speed.
- Bad, because the permission surface stays wide and persistence stays hard to test.

## More Information

See `openspec/changes/macos-flutter-notepad/design.md` decisions D2, D3 and D4.
