# function-list Specification

## Purpose
A filterable, click-to-jump outline of functions, classes and headings for the active document.
## Requirements
### Requirement: Function List panel
The system SHALL provide a right-docked Function List panel that lists the functions, classes, methods and headings of the active document, each with its kind and line number.

#### Scenario: Functions are listed
- **GIVEN** a JavaScript document with functions `a` and `b` and a class `C`
- **WHEN** the Function List is shown
- **THEN** it lists `a`, `b` and `C` with their kinds and line numbers

#### Scenario: Markdown headings are listed
- **GIVEN** a Markdown document with two headings
- **WHEN** the Function List is shown
- **THEN** it lists both headings in document order

#### Scenario: Document with no symbols
- **GIVEN** a plain text document
- **WHEN** the Function List is shown
- **THEN** it shows an empty-state message

### Requirement: Click to jump
The system SHALL move the caret to a symbol's line and scroll it into view when the user clicks the symbol in the Function List.

#### Scenario: Jump to a function
- **GIVEN** the Function List shows function `b` on line 40
- **WHEN** the user clicks `b`
- **THEN** the caret is on line 40 and the line is visible

### Requirement: Filter symbols
The system SHALL provide a filter box that limits the list to symbols whose name contains the typed text, ignoring case.

#### Scenario: Filter by name
- **GIVEN** the list contains `parseJson` and `renderTab`
- **WHEN** the user types "json" in the filter box
- **THEN** only `parseJson` is shown

### Requirement: Keep the list current
The system SHALL refresh the list after edits, when the active tab changes and when the document language changes, without blocking typing. The panel SHALL keep showing the last complete list while the syntax tree is not yet fully parsed.

#### Scenario: New function appears
- **GIVEN** the Function List is shown
- **WHEN** the user types a new function and pauses
- **THEN** the new function appears in the list

#### Scenario: Switch tabs
- **GIVEN** two tabs with different functions
- **WHEN** the user activates the other tab
- **THEN** the list shows that tab's functions

### Requirement: Supported languages
The system SHALL provide symbols for every language that has highlighting support (cpp, css, go, html, java, javascript/typescript, json, markdown, python, rust, sql, xml, yaml), using the syntax tree where it exposes symbols and line patterns otherwise.

#### Scenario: Language without tree symbols
- **GIVEN** a SQL document with a `CREATE FUNCTION` statement
- **WHEN** the Function List is shown
- **THEN** the function is listed

### Requirement: Show and hide the panel
The system SHALL provide View > Function List to show or hide the panel, and SHALL remember the choice between launches.

#### Scenario: Visibility persists
- **GIVEN** the user showed the Function List
- **WHEN** the app is restarted
- **THEN** the Function List is shown

