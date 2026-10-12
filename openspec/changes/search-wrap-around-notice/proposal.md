## Why

Find Next and Find Previous give no feedback when the search runs off the end (or start) of the document. "Wrap around" defaults to off, so the caret just stays where it is and nothing visibly happens. Users assume search is broken or that there are no more matches.

## What Changes

- "Wrap around" defaults to **on**.
- Find Next past the last match with wrap on: jump to the first match and show "Reached end of document, continuing from top".
- Find Previous past the first match with wrap on: jump to the last match and show "Reached start of document, continuing from bottom".
- With wrap off, at the end or start of the document: stay put and show "No more results".
- With no matches at all: show "No results found". This stays distinct from "No more results".
- Where the message appears:
  - Find dialog open: the existing `find-message` status line, which stays until the next search action.
  - Dialog closed (Mod+G / Mod+Shift+G): the existing toast (`app/toast.ts`).
- Out of scope: Mark, Find in Files, Replace in Files.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `find-replace`: "Wrap around" default becomes on. Find Next/Previous now report end-of-document wrap, "No more results" and "No results found" instead of failing silently, in both the dialog and the keyboard shortcuts.

## Impact

- `notepad-next/src/search/searchService.ts`: the search result must say whether it wrapped or hit the boundary.
- `notepad-next/src/search/findController.ts`: wrap default flips to `true`, and the result is carried through to callers.
- `notepad-next/src/search/findDialog.ts`: show the notice in `find-message`.
- `notepad-next/src/app/commands.ts`: the `search.findNext` and `search.findPrev` shortcuts show the toast.
- Tests: `findController.test.ts`, `searchService.test.ts`, `commands.test.ts`.
- Behaviour change for existing users: wrap is now on by default. This is not a breaking API change, and users can still turn it off.
- Settings: if wrap is persisted, existing saved values keep their choice. This needs confirming in design.
