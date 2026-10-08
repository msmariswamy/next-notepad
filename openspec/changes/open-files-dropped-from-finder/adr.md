# ADR Review Manifest

- Status: completed
- Review date: 2026-10-07

## Review Summary

ADR review completed for this change. One decision met the bar for a durable record: the macOS document-type stance (design D4). The other decisions follow existing patterns and are tactical, so they got no ADR:
- D1 and D2 (drop subscription through `Platform`, per-file open loop): the `Platform` seam already exists (ADR-0004 testing approach), and the loop is local implementation.
- D3 (leave Tauri's drag-drop default on): a configuration default, not a commitment.
- D5 (reuse `RunEvent::Opened` and the queue): already decided in ADR-0009.

## In-Force ADRs Reviewed

No ADR was superseded; all of 0001 to 0009 remain in force, and this change is coherent with them.

- ADR-0001: Use Tauri 2 with CodeMirror 6
- ADR-0002: Rust backend owns the filesystem and session store (drops yield paths only; reading stays in `open_file`)
- ADR-0003: Regex-compat layer with a JavaScript fallback (not affected)
- ADR-0004: End-to-end tests in Playwright WebKit on macOS (browser host fakes the drop)
- ADR-0005: Split view mirrors one primary document (not affected)
- ADR-0006: Macros stored as high-level steps (not affected)
- ADR-0007: XML to JSON mapping with `@attr` and `#text` keys (not affected)
- ADR-0008: YAML package with 1.2 core schema (not affected)
- ADR-0009: Loopback TCP IPC between CLI client and app (its queue carries Finder-opened files)

## New Durable ADRs Created

- `adr/0010-declare-the-app-as-an-alternate-catch-all-document-handler.md`: the app is available for any file on macOS and is the default for none.
