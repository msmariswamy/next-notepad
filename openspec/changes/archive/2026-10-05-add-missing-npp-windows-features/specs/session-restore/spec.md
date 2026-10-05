## RENAMED Requirements

- FROM: `### Requirement: Contents only`
- TO: `### Requirement: Text, cursor and scroll position`

## MODIFIED Requirements

### Requirement: Text, cursor and scroll position
The system SHALL restore text content, the selection (cursor position) and the scroll position of every restored tab, and SHALL NOT be required to restore undo history. Cursor and scroll data SHALL be optional in the stored session so a session written by an earlier version still restores, with the caret at the start of the document.

#### Scenario: Cursor position after restore
- **GIVEN** a tab whose caret was on line 12 when the app quit
- **WHEN** the tab is restored
- **THEN** the caret is on line 12

#### Scenario: Scroll position after restore
- **GIVEN** a tab scrolled to line 200 when the app quit
- **WHEN** the tab is restored
- **THEN** the tab is scrolled so line 200 is visible

#### Scenario: Older session without view state
- **GIVEN** a session written by a version that stored no cursor or scroll data
- **WHEN** the app is launched
- **THEN** the tabs restore with the caret at the start of the document

#### Scenario: Position beyond the restored text
- **GIVEN** a saved cursor position that is past the end of the file because the file changed on disk
- **WHEN** the tab is restored
- **THEN** the caret is clamped to the end of the document and no error is shown

#### Scenario: Undo history is not restored
- **WHEN** a tab is restored
- **THEN** Undo has nothing to undo
