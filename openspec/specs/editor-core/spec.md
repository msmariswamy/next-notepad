# editor-core Specification

## Purpose
TBD - created by archiving change macos-flutter-notepad. Update Purpose after archive.
## Requirements
### Requirement: Open and save files
The system SHALL open existing text files into the editor and save edits back to disk, including Save As for new or untitled documents.

#### Scenario: Open an existing file
- **GIVEN** a UTF-8 text file exists on disk
- **WHEN** the user opens it
- **THEN** its content appears in a new tab titled with the file name

#### Scenario: Save an edited file
- **GIVEN** an open file has unsaved edits
- **WHEN** the user saves
- **THEN** the file on disk matches the editor content and the dirty indicator clears

#### Scenario: Save an untitled document
- **GIVEN** an untitled document with content
- **WHEN** the user saves
- **THEN** a save dialog asks for a path and the document becomes bound to that path

### Requirement: Preserve encoding and line endings
The system SHALL detect each file's encoding and line-ending style on open, show them in the status bar, and write the same encoding and line endings back on save unless the user changes them.

#### Scenario: Round-trip a CRLF file
- **GIVEN** a UTF-8 file with CRLF line endings
- **WHEN** the user edits and saves it
- **THEN** the saved file still uses UTF-8 and CRLF

#### Scenario: Change line ending
- **GIVEN** an open document using LF
- **WHEN** the user converts it to CRLF
- **THEN** the status bar shows CRLF and the document becomes dirty

### Requirement: Multi-caret and column editing
The system SHALL support multiple simultaneous carets and rectangular (column) selection.

#### Scenario: Type at multiple carets
- **GIVEN** three carets placed on three lines
- **WHEN** the user types text
- **THEN** the text is inserted at all three positions

#### Scenario: Column selection
- **GIVEN** a block of lines
- **WHEN** the user drags a rectangular selection
- **THEN** only the selected columns on each line are selected

### Requirement: Code folding and line numbers
The system SHALL show line numbers and allow folding of foldable regions.

#### Scenario: Fold a block
- **GIVEN** a JSON object spanning several lines
- **WHEN** the user clicks the fold marker
- **THEN** the lines inside the block are hidden until it is unfolded

### Requirement: Status bar
The system SHALL show line, column, selection length, total length, line count, line ending, encoding and language in a status bar.

#### Scenario: Cursor movement updates status bar
- **WHEN** the user moves the caret to line 3, column 5
- **THEN** the status bar shows Ln 3, Col 5

### Requirement: Large file limit
The system SHALL warn before opening a file larger than the configured size threshold (default 50 MB).

#### Scenario: Open an oversized file
- **GIVEN** a file larger than the threshold
- **WHEN** the user opens it
- **THEN** a warning asks whether to continue before the file loads

