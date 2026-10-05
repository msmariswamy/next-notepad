# session-restore Specification

## Purpose
Never lose text: keep every open tab, saved or untitled, and restore it on the next launch, even after a crash.
## Requirements
### Requirement: Persist all tabs on quit
The system SHALL write the state of every open tab to the app-data directory when the app quits. Untitled and dirty tabs SHALL store their full text; clean saved tabs SHALL store only their file path.

#### Scenario: Quit with untitled tabs
- **GIVEN** three untitled tabs containing text
- **WHEN** the user quits the app
- **THEN** the text of all three tabs is stored in the app-data directory

#### Scenario: Quit with a dirty saved file
- **GIVEN** a tab bound to a file with unsaved edits
- **WHEN** the user quits the app
- **THEN** the edited text is stored, and the file on disk is not modified

### Requirement: Restore tabs on launch
The system SHALL restore every stored tab with its content, title, file association, encoding, line endings and dirty state when the app launches.

#### Scenario: Relaunch restores unsaved tabs
- **GIVEN** the app was quit with two untitled tabs containing text
- **WHEN** the app is launched again
- **THEN** both tabs reappear with the same text and are marked modified

#### Scenario: Active tab restored
- **GIVEN** the third of five tabs was active at quit
- **WHEN** the app is launched again
- **THEN** the third tab is active

### Requirement: Snapshot while editing
The system SHALL write a debounced session snapshot after edits so unsaved text survives a crash or forced quit.

#### Scenario: Crash recovery
- **GIVEN** the user typed text in an untitled tab and stopped for more than the debounce interval
- **WHEN** the app process is killed and relaunched
- **THEN** the typed text is restored

### Requirement: Atomic session writes
The system SHALL write session files atomically so an interrupted write cannot corrupt the existing session.

#### Scenario: Interrupted write
- **GIVEN** a valid session exists
- **WHEN** the app is killed in the middle of a snapshot
- **THEN** the next launch loads either the previous or the new complete session

### Requirement: Corrupt or missing session handling
If the session store is missing or unreadable, the system SHALL start with an empty document and SHALL preserve the unreadable files for inspection instead of deleting them.

#### Scenario: Corrupt session file
- **GIVEN** `session.json` contains invalid JSON
- **WHEN** the app launches
- **THEN** an empty document opens, the bad file is renamed with a `.corrupt` suffix, and no crash occurs

### Requirement: Missing file on restore
If a restored tab's file no longer exists on disk, the system SHALL still restore any unsaved text and mark the tab as detached from the missing path.

#### Scenario: File deleted between sessions
- **GIVEN** a dirty tab bound to a file that was deleted
- **WHEN** the app launches
- **THEN** the tab opens with its stored text, shows a warning marker with a tooltip naming the missing path, and the status bar says the file was not found

#### Scenario: Saving clears the missing marker
- **GIVEN** a restored tab marked as missing
- **WHEN** the user saves it
- **THEN** the marker and the status-bar note disappear

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

