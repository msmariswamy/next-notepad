# ADR Review Manifest

- Status: completed
- Review date: 2026-10-06

## Review Summary

ADR review completed for this change. D2 and D3 (the loopback TCP server, the token file and the line-based protocol) are a durable boundary that later features will reuse, so they got an ADR. D1 (the binary is its own client), D4 (start the app on demand), D5 to D9 (frontend-driven waiting, paths, macOS events, the Windows console, the installer) are tactical implementation choices and did not get ADRs. No in-force ADR was revisited or superseded. The `architectural-decision-records` skill named in the repo rules is not installed here, so the existing MADR layout of the repo's ADRs was followed.

## In-Force ADRs Reviewed

- ADR-0001: Use Tauri 2 with CodeMirror 6 for the cross-platform notepad-next app
- ADR-0002: Rust backend owns the filesystem and session store
- ADR-0003: Use a regex-compat layer with a JavaScript fallback for Find in Files
- ADR-0004: Run end-to-end tests in Playwright WebKit on macOS
- ADR-0005: Split view mirrors edits between two views and keeps one primary document
- ADR-0006: Store macros as versioned high-level steps in a backend-owned JSON file
- ADR-0007: Map XML to JSON with `@attr` and `#text` keys
- ADR-0008: Use the `yaml` package with the YAML 1.2 core schema

## New Durable ADRs Created

- `adr/0009-loopback-tcp-ipc-between-cli-client-and-app.md`
