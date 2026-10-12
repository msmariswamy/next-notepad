# ADR Review Manifest

- Status: completed
- Review date: 2026-10-12

## Review Summary

ADR review completed for this change.

The change adds boundary and wrap feedback to Find Next and Find Previous, and flips the "Wrap around" default to on. The find-outcome result type and the shared message formatter in `design.md` (decisions 1 and 2) are internal to the search module. They are tactical implementation details and do not establish a long-term pattern, technology, boundary or contract that later changes must follow. The wrap default is not persisted, so no stored data contract changes. No decision diverges from an in-force ADR.

## In-Force ADRs Reviewed

All ten ADRs in `adr/` are accepted, none has a `Supersedes:` link pointing at it, and so all are in force:

- ADR-0001 Tauri 2 and CodeMirror 6
- ADR-0002 Rust backend owns filesystem and session store
- ADR-0003 Regex compat layer with JavaScript fallback (search semantics unchanged here)
- ADR-0004 End-to-end tests in Playwright WebKit on macOS
- ADR-0005 Split view mirrors one primary document
- ADR-0006 Macros stored as high-level steps (macro playback of Find Next stays compatible, per design decision 5)
- ADR-0007 XML/JSON mapping uses attr and text keys
- ADR-0008 YAML package with 1.2 core schema
- ADR-0009 Loopback TCP IPC between CLI client and app
- ADR-0010 Declare the app as an alternate catch-all document handler

## New Durable ADRs Created

- None - no major durable architectural decisions were introduced, and no new repository-level ADR files were created.
