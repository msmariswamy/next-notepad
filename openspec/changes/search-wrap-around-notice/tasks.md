## 1. Search service: report what happened

- [ ] 1.1 Add failing unit tests in `notepad-next/src/search/searchService.test.ts` for forward and backward: wrap hit, boundary (wrap off), and no match at all
- [ ] 1.2 Change `findNext` in `notepad-next/src/search/searchService.ts` to return `{ range, wrapped }` for a hit and `{ range: null, reason: "boundary" | "none" }` otherwise; keep the caret and zero-length-match rules unchanged
- [ ] 1.3 Update the existing `searchService.test.ts` cases for the new return shape and confirm they pass

## 2. Outcome and message wording

- [ ] 2.1 Add failing unit tests for `findMessage(outcome, backward)` covering the four outcomes and both directions (exact texts from the spec)
- [ ] 2.2 Add `FindOutcome` (`"found" | "wrapped" | "boundary" | "none"`) and `findMessage` in `notepad-next/src/search/` and make the tests pass

## 3. Find controller

- [ ] 3.1 Add failing tests in `notepad-next/src/search/findController.test.ts`: `findNext` returns the outcome, selects the hit on `found`/`wrapped`, and leaves the selection on `boundary`/`none`
- [ ] 3.2 Make `FindController.findNext` and `findNextCore` return `FindOutcome`; keep `onAction` recording unchanged
- [ ] 3.3 Flip `DEFAULT_FIND_STATE.wrap` to `true` and add a test that a fresh controller has wrap on
- [ ] 3.4 Make `replace()` return the outcome of its follow-up search so the dialog can report a wrap after the last replacement

## 4. Find dialog

- [ ] 4.1 Replace the "Can't find the text" handling on both Find Next buttons in `notepad-next/src/search/findDialog.ts` with `findMessage(outcome, backward)`; show nothing for `found`
- [ ] 4.2 Show the wrap message after Replace when the follow-up search wrapped
- [ ] 4.3 Check the dialog message is cleared or replaced on the next search action, and that the "Wrap around" checkbox starts selected

## 5. Keyboard shortcuts

- [ ] 5.1 Add failing tests in `notepad-next/src/app/commands.test.ts`: `search.findNext` and `search.findPrev` call `app.notify` with the `findMessage` text for `wrapped`, `boundary` and `none`, and stay silent for `found`
- [ ] 5.2 Update the two commands in `notepad-next/src/app/commands.ts` to toast the message through `app.notify(..., "info")`, keeping the `quietly` handling of invalid regex
- [ ] 5.3 Check in the app whether the shortcut toast and the open dialog's own message look right together; if the double message looks wrong, skip the toast while the dialog is open

## 6. Macro playback

- [ ] 6.1 Add failing tests in `notepad-next/src/macro/player.test.ts`: a recorded Find Next that wraps succeeds; one that reaches `boundary` or `none` still raises "No match found"
- [ ] 6.2 Update `notepad-next/src/macro/player.ts` to treat only `boundary` and `none` as failure, without showing messages
- [ ] 6.3 Run the existing macro recorder and controller tests and confirm they still pass

## 7. End-to-end and verification

- [ ] 7.1 Add e2e cases to `notepad-next/e2e/find.spec.ts`: wrap forward, wrap backward, wrap off ("No more results"), no match ("No results found"), shortcut toast with the dialog closed
- [ ] 7.2 Run the full unit test suite and the e2e suite and confirm they pass
- [ ] 7.3 Try the feature by hand: search past the end of a real document with wrap on and off, with the dialog open and closed
- [ ] 7.4 Run `openspec validate search-wrap-around-notice --type change --strict` before archive
