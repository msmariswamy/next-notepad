# ADR Review Manifest

- Status: completed
- Review date: 2026-10-06

## Review Summary

ADR review completed for this change. Of the design decisions, D6 (the XML to JSON mapping convention, which later conversions and exports will depend on) and D4 (the `yaml` package with the YAML 1.2 core schema, which every later YAML feature will read through) are durable commitments. D1 (shared tool runner), D2 (own strict XML tokenizer), D3, D5, D7, D8 and D9 are tactical implementation choices and did not get ADRs. No in-force ADR was revisited or superseded. The `architectural-decision-records` skill named in the repo rules is not installed here, so the existing MADR layout of the repo's ADRs was followed.

## In-Force ADRs Reviewed

- ADR-0001: Use Tauri 2 with CodeMirror 6 for the cross-platform notepad-next app
- ADR-0002: Rust backend owns the filesystem and session store
- ADR-0003: Use a regex-compat layer with a JavaScript fallback for Find in Files
- ADR-0004: Run end-to-end tests in Playwright WebKit on macOS (amends the confirmation section of ADR-0001)
- ADR-0005: Split view mirrors edits between two views and keeps one primary document
- ADR-0006: Store macros as versioned high-level steps in a backend-owned JSON file

## New Durable ADRs Created

- `adr/0007-xml-json-mapping-uses-attr-and-text-keys.md`
- `adr/0008-yaml-package-with-1-2-core-schema.md`
