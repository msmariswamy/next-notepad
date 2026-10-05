# view-options Specification

## Purpose
Display options: word wrap, show all characters, and tab width or tab-character indentation.
## Requirements
### Requirement: Word wrap
The system SHALL provide View > Word Wrap, which wraps long lines at the window edge without changing the text, and applies to every tab.

#### Scenario: Toggle word wrap
- **GIVEN** a document with a line longer than the window
- **WHEN** the user turns on View > Word Wrap
- **THEN** the line is displayed across several visual lines and the document text is unchanged

#### Scenario: Word wrap persists
- **WHEN** the user turns Word Wrap on and restarts the app
- **THEN** Word Wrap is still on

### Requirement: Show all characters
The system SHALL provide View > Show All Characters, which marks spaces, tabs and line endings (LF, CRLF, CR) with visible symbols, in addition to the existing Show Whitespace option for spaces and tabs only.

#### Scenario: Line endings are visible
- **GIVEN** the document "a\nb" with line ending CRLF
- **WHEN** the user turns on Show All Characters
- **THEN** each line end shows a CRLF marker

#### Scenario: Spaces and tabs are visible
- **GIVEN** the text "a b\tc"
- **WHEN** Show All Characters is on
- **THEN** the space and the tab are marked

#### Scenario: The text is unchanged
- **WHEN** Show All Characters is on
- **THEN** copying the text yields the original characters without markers

### Requirement: Indentation settings
The system SHALL provide settings for tab width (default 4) and whether Tab inserts spaces or a tab character (default spaces), used by Tab/Shift+Tab, Indent/Outdent, TAB/Space conversion and code formatting.

#### Scenario: Tab width
- **GIVEN** the tab width 2 with spaces
- **WHEN** the user presses Tab on an empty line
- **THEN** two spaces are inserted

#### Scenario: Tabs instead of spaces
- **GIVEN** the setting "use tab character"
- **WHEN** the user presses Tab
- **THEN** a tab character is inserted

