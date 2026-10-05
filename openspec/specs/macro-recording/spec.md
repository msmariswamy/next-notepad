# macro-recording Specification

## Purpose
Record, replay, repeat and save named macros of typing, movement, commands and Find/Replace.
## Requirements
### Requirement: Record a macro
The system SHALL provide Macro > Start Recording and Stop Recording, which capture typed or deleted text, registry commands and Find/Replace commands performed in the editor as an ordered list of steps.

#### Scenario: Typing is recorded
- **GIVEN** recording has started
- **WHEN** the user types "abc" and stops recording
- **THEN** the recorded macro contains a text step that inserts "abc"

#### Scenario: Commands are recorded
- **GIVEN** recording has started
- **WHEN** the user runs Sort Lines Ascending and stops recording
- **THEN** the recorded macro contains a command step for Sort Lines Ascending

#### Scenario: Find and Replace is recorded with its options
- **GIVEN** recording has started
- **WHEN** the user runs Replace All with the regex `a+` and the replacement "x"
- **THEN** the recorded macro contains a command step that carries the pattern, the replacement and the search mode

#### Scenario: Dialog-opening commands are rejected
- **GIVEN** recording has started
- **WHEN** the user runs a command that opens a dialog or a tab, such as Open File
- **THEN** the command is not recorded and a toast says it cannot be recorded

### Requirement: Play back a macro
The system SHALL provide Macro > Playback, which replays the last recorded or selected macro at the current selection, as one undo step per playback.

#### Scenario: Playback at a new position
- **GIVEN** a macro that records typing "x" followed by Move Line Down
- **WHEN** the user places the caret on another line and plays the macro
- **THEN** "x" is inserted at that caret and the line moves down

#### Scenario: Playback is one undo step
- **GIVEN** a macro with several steps was played
- **WHEN** the user presses Undo once
- **THEN** all changes made by the playback are reverted

#### Scenario: Recording and playback are exclusive
- **GIVEN** recording is in progress
- **WHEN** the user starts a playback
- **THEN** the playback does not start and a toast says to stop recording first

### Requirement: Run a macro multiple times
The system SHALL provide Macro > Run Multiple Times, which plays a macro a chosen number of times or until the end of the file.

#### Scenario: Run a fixed number of times
- **GIVEN** a macro that inserts "x" at the caret
- **WHEN** the user runs it 3 times
- **THEN** "xxx" is inserted

#### Scenario: Run until end of file
- **GIVEN** a macro that moves the caret down by one line and deletes the first character
- **WHEN** the user runs it until the end of the file
- **THEN** playback stops once the caret cannot advance and no error is raised

#### Scenario: A step failure stops the run
- **GIVEN** a macro whose Find step finds no match
- **WHEN** the user runs it multiple times
- **THEN** playback stops at that step and a toast names the failed step

### Requirement: Save and manage named macros
The system SHALL let the user save the recorded macro under a name, rename and delete saved macros, and run a saved macro from the Macro menu. Saved macros SHALL persist in a versioned JSON file in the app-data directory, written atomically by the backend.

#### Scenario: Saved macro survives a restart
- **GIVEN** the user saved a macro named "cleanup"
- **WHEN** the app is restarted
- **THEN** "cleanup" appears in the Macro menu and can be played

#### Scenario: Unknown command at playback
- **GIVEN** a saved macro that references a command id that no longer exists
- **WHEN** the user plays it
- **THEN** playback stops with a toast naming the unknown step and the document is unchanged

#### Scenario: Corrupt macro file
- **GIVEN** the macro file contains invalid JSON
- **WHEN** the app starts
- **THEN** the Macro menu lists no saved macros, the file is preserved for inspection and the app starts normally

