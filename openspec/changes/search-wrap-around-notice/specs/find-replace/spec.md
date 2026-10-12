## ADDED Requirements

### Requirement: Search boundary feedback
The system SHALL report the outcome of every Find Next and Find Previous, so a search that reaches the end of the document or finds nothing never ends silently. When the search passes the end of the document with "Wrap around" selected, the system SHALL continue from the top and say so. When the search reaches the end of the document with "Wrap around" cleared, the system SHALL keep the selection and say "No more results". When the document has no match at all, the system SHALL say "No results found". Searching backward SHALL behave the same way, mirrored: it wraps from the start of the document to the end.

The message SHALL appear in the Find dialog status line while the dialog is open and SHALL stay until the next search action. When the search is started from the keyboard shortcuts, the message SHALL appear as a transient toast.

#### Scenario: Wrapping past the end of the document
- **GIVEN** "Wrap around" is selected and the caret is after the last match of "cat"
- **WHEN** the user clicks Find Next
- **THEN** the first match in the document is selected
- **AND** the message "Reached end of document, continuing from top" is shown

#### Scenario: Wrapping past the start of the document
- **GIVEN** "Wrap around" is selected and the caret is before the first match of "cat"
- **WHEN** the user searches backward
- **THEN** the last match in the document is selected
- **AND** the message "Reached start of document, continuing from bottom" is shown

#### Scenario: Reaching the end without wrap around
- **GIVEN** "Wrap around" is cleared and the caret is after the last match of "cat"
- **WHEN** the user clicks Find Next
- **THEN** the selection does not move
- **AND** the message "No more results" is shown

#### Scenario: Reaching the start without wrap around
- **GIVEN** "Wrap around" is cleared and the caret is before the first match of "cat"
- **WHEN** the user searches backward
- **THEN** the selection does not move
- **AND** the message "No more results" is shown

#### Scenario: Text that does not occur in the document
- **GIVEN** the document does not contain "zebra"
- **WHEN** the user clicks Find Next for "zebra"
- **THEN** the message "No results found" is shown
- **AND** the message differs from "No more results"

#### Scenario: Searching from the keyboard with the dialog closed
- **GIVEN** the Find dialog is closed, "Wrap around" is selected and the caret is after the last match of "cat"
- **WHEN** the user presses the Find Next shortcut
- **THEN** the first match in the document is selected
- **AND** a toast shows "Reached end of document, continuing from top"

#### Scenario: Message stays until the next search action
- **GIVEN** the Find dialog is open and shows "No more results"
- **WHEN** the user changes the search text and clicks Find Next on a text that has a match after the caret
- **THEN** the match is selected
- **AND** the dialog no longer shows "No more results"

#### Scenario: Wrapping during Replace
- **GIVEN** "Wrap around" is selected and the caret is on the last match of "cat"
- **WHEN** the user clicks Replace
- **THEN** the match is replaced and the first remaining match is selected
- **AND** the message "Reached end of document, continuing from top" is shown

#### Scenario: Macro playback is not interrupted by a wrap
- **GIVEN** a recorded macro that contains Find Next and "Wrap around" is selected
- **WHEN** the macro is played with the caret after the last match
- **THEN** the step succeeds and the first match is selected

## MODIFIED Requirements

### Requirement: Match options
The system SHALL support "Match whole word only", "Match case" and "Wrap around". "Wrap around" SHALL be selected by default.

#### Scenario: Whole word
- **GIVEN** the text "cat concat" and "Match whole word only" selected
- **WHEN** the user finds "cat"
- **THEN** only the standalone word "cat" matches

#### Scenario: Case sensitivity
- **GIVEN** "Match case" is cleared and the text "Foo foo"
- **WHEN** the user counts "foo"
- **THEN** the count is 2

#### Scenario: Wrap around
- **GIVEN** "Wrap around" is selected and the caret after the last match
- **WHEN** the user clicks Find Next
- **THEN** the first match in the document is selected

#### Scenario: Wrap around is on for a new session
- **GIVEN** the application has just started
- **WHEN** the user opens the Find dialog
- **THEN** "Wrap around" is selected
