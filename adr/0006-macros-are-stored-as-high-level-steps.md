---
status: "accepted"
date: 2026-10-06
decision-makers: mariswamypillai
consulted: none
informed: none
---

# Store macros as versioned high-level steps in a backend-owned JSON file

Supersedes: none

## Context and Problem Statement

Macros must record what a user does and replay it later, possibly after an app update and on a different OS. The recording format becomes a persisted contract: saved macros outlive the build that wrote them. Many commands come from native menus, and keyboard layouts differ between macOS and Windows, so raw key events are unreliable. Persistence must also follow ADR-0002.

## Decision Drivers

- Macros replay the same on macOS and Windows and across keyboard layouts
- Saved macros survive upgrades
- Find/Replace in macros keeps ADR-0003 regex semantics
- Persistence stays in the Rust backend with atomic writes

## Considered Options

- High-level steps: relative text edits plus registry command ids with arguments, in versioned JSON
- Raw key and mouse events
- Notepad++ `shortcuts.xml` compatible format

## Decision Outcome

Chosen option: "High-level steps in versioned JSON", because command ids are already stable across platforms and menus, text steps are relative to the selection, and Find/Replace steps replay through `FindController` and `regex-compat`. The file is written by a Rust command using the shared atomic-write helper (ADR-0002), with a `version` field for future migrations.

### Consequences

- Good, because macros are platform- and layout-independent and testable without a UI.
- Good, because a missing command id at playback is a clear, reportable failure.
- Bad, because command ids become a compatibility surface: renaming or removing one breaks saved macros, so changes to ids need a migration step.
- Bad, because commands that open dialogs or tabs are not recordable in v1.

### Confirmation

Confirmed by unit tests for recording and replay, a Rust test for the file's atomic write and corrupt-file handling, and an e2e record, save, restart and play flow.

## Pros and Cons of the Options

### High-level steps in versioned JSON

- Good, because it is stable and testable.
- Bad, because command ids must be kept stable.

### Raw key and mouse events

- Good, because it is simple to capture.
- Bad, because it breaks across layouts and does not capture native-menu commands.

### Notepad++ `shortcuts.xml` compatible format

- Good, because Windows users could import macros.
- Bad, because it couples the app to a foreign format and command numbering that next-notepad does not share.

## More Information

See `openspec/changes/add-missing-npp-windows-features/design.md` decision D2, ADR-0002 and ADR-0003.
