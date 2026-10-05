# ADR Review Manifest

- Status: completed
- Review date: 2026-10-06

## Review Summary

ADR review completed for this change. Of the design decisions, D1 (split-view sync model) and D2 (macro step format and persistence) are durable commitments that later changes will build on. D3 to D7 are tactical implementation choices and did not get ADRs. No in-force ADR was revisited or superseded. The `c4-diagrams` and `architectural-decision-records` skills named in the repo rules are not installed here, so the existing MADR layout of the repo's ADRs was followed.

## In-Force ADRs Reviewed

- ADR-0001: Use Tauri 2 with CodeMirror 6 for the cross-platform notepad-next app
- ADR-0002: Rust backend owns the filesystem and session store
- ADR-0003: Use a regex-compat layer with a JavaScript fallback for Find in Files
- ADR-0004: Run end-to-end tests in Playwright WebKit on macOS (amends the confirmation section of ADR-0001)

## New Durable ADRs Created

- `adr/0005-split-view-mirrors-one-primary-document.md`
- `adr/0006-macros-are-stored-as-high-level-steps.md`
