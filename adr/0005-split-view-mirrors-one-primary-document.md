---
status: "accepted"
date: 2026-10-06
decision-makers: mariswamypillai
consulted: none
informed: none
---

# Split view mirrors edits between two views and keeps one primary document

Supersedes: none

## Context and Problem Statement

Split view shows one document in two panes. CodeMirror 6 views each own their own `EditorState`, so two views over one document cannot share state directly. The app keeps one `EditorState` per tab (with its undo history), and later features such as macros, Find/Replace and session snapshots assume exactly one authoritative document per tab. We need a sync model for two panes that keeps one text, one dirty flag and one undo history.

## Decision Drivers

- Edits in either pane must appear in the other without drift
- One undo history and one dirty state per tab
- No change to the per-tab state, session snapshot and Find/Replace code that assume a single document
- Independent cursor and scroll per pane

## Considered Options

- The primary view owns the document; the clone's transactions are forwarded to it and mirrored back
- Two independent copies of the text, reconciled on save
- A document model outside CodeMirror that both views render

## Decision Outcome

Chosen option: "The primary view owns the document and the clone mirrors it", because it keeps a single authoritative state and history, needs no new document model, and leaves every single-document consumer unchanged.

### Consequences

- Good, because undo, dirty tracking, snapshots, macros and Find/Replace keep operating on the primary state only.
- Good, because closing a split destroys only the secondary view.
- Bad, because every edit is applied twice (once per view) and mirrored changes need a `remote` annotation to avoid forwarding loops, which needs focused tests.
- Bad, because any future per-pane feature (such as per-pane tabs) must be designed on top of this model or supersede it.

### Confirmation

Confirmed by unit tests that drive edits and undo from both panes, and by macOS Playwright e2e of the split flows.

## Pros and Cons of the Options

### The primary view owns the document

- Good, because one source of truth.
- Bad, because of the double application cost.

### Two independent copies

- Good, because the views are simple.
- Bad, because the copies can diverge, contradicting the clone requirement.

### A document model outside CodeMirror

- Good, because both views are symmetrical.
- Bad, because it is a large rewrite of the editor integration.

## More Information

See `openspec/changes/add-missing-npp-windows-features/design.md` decision D1 and ADR-0001.
