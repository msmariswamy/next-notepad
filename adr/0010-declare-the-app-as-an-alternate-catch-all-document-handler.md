---
status: "accepted"
date: 2026-10-07
decision-makers: mariswamypillai
consulted: none
informed: none
---

# Declare next-notepad as an alternate catch-all document handler, never the default

Supersedes: none

## Context and Problem Statement

On macOS, Finder only offers an app for a file (in "Open With", or as a Dock-icon drop target) if the app's bundle declares document types. next-notepad declared none, so dropping a file on its Dock icon did nothing. Declaring document types also decides whether the app claims to be the default handler for a file type, which would change what double-clicking a file does for every user who installs it. The declaration lives in the bundle and later work (more extensions, Windows and Linux associations) will extend it, so the stance has to be set once.

## Decision Drivers

- A text editor should accept any file, not only a list of known extensions
- Installing the app must not change which application opens a user's existing files
- No extension list to keep in step with the `language-detection` spec
- The same stance should carry to Windows and Linux file associations later

## Considered Options

- Catch-all document type with alternate rank
- A fixed list of extensions with default rank
- A fixed list of extensions with alternate rank
- Plain-text content types only (`public.plain-text`, `public.text`)

## Decision Outcome

Chosen option: "catch-all document type with alternate rank", because it makes the app available for any file without taking over any file type. Users who want next-notepad as the default for an extension choose that themselves in Finder.

### Consequences

- Good, because Dock drops and "Open With" work for every file, and installing the app never changes existing associations.
- Good, because there is no extension list to maintain.
- Bad, because "Open With" offers the app for files it handles poorly, such as binaries; the existing large-file prompt and open errors are the only guard.
- Bad, because making it the default for a type is a manual user step; a convenience setting could be added later without changing this decision.
- Follow-up: later Windows and Linux file-association work follows the same rule (available for any file, default for none) unless a new ADR supersedes this one.

### Confirmation

Confirmed by checking the built bundle's `Info.plist` for the catch-all document type with alternate rank, the `macos-document-types` spec scenarios, and the manual checklist in the change's `verification.md` (Dock drop, "Open With", default application unchanged).

## Pros and Cons of the Options

### Catch-all document type with alternate rank

- Good, because any file can be opened and no default is taken.
- Neutral, because the exact config key depends on the Tauri version (settled at implementation).
- Bad, because the app is offered for files it cannot edit well.

### Fixed extension list with default rank

- Good, because double-clicking listed files opens next-notepad.
- Bad, because it silently takes over users' existing associations and the list drifts from the language list.

### Fixed extension list with alternate rank

- Good, because it does not take over associations.
- Bad, because a file with an unlisted extension cannot be dropped on the Dock icon, which is the bug being fixed.

### Plain-text content types only

- Good, because it matches what a text editor is for.
- Bad, because many text files (logs, dotfiles, unknown extensions) are not typed as plain text and would still be refused.

## More Information

See `openspec/changes/open-files-dropped-from-finder/design.md` decision D4 and the `macos-document-types` spec. Builds on ADR-0009 for delivery of the files to the app.
