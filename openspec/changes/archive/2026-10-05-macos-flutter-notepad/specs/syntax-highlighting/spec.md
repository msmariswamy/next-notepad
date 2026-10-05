## ADDED Requirements

### Requirement: Language detection by extension
The system SHALL choose a highlighting language from the file extension when a file is opened or saved.

#### Scenario: JSON file
- **WHEN** the user opens `data.json`
- **THEN** the status bar shows JSON and tokens are highlighted as JSON

#### Scenario: Unknown extension
- **WHEN** the user opens a file with an unknown extension
- **THEN** the document is shown as plain text

### Requirement: Manual language selection
The system SHALL let the user choose a language for the current document from the Language menu, overriding detection.

#### Scenario: Choose language for untitled tab
- **GIVEN** an untitled tab with JSON text
- **WHEN** the user selects Language, then JSON
- **THEN** the content is highlighted as JSON

### Requirement: JSON highlighting
The system SHALL highlight JSON keys, strings, numbers, booleans, null and punctuation distinctly, and mark syntax errors.

#### Scenario: Syntax error is marked
- **GIVEN** a JSON document `{"a": 1 "b": 2}`
- **WHEN** the language is JSON
- **THEN** the position of the first syntax error is underlined and the mark disappears once the JSON is valid

#### Scenario: Distinct token styles
- **GIVEN** `{"name": "x", "n": 1, "ok": true}`
- **THEN** keys, strings, numbers and booleans render with different styles

### Requirement: Common language support
The system SHALL support highlighting for common languages including plain text, JSON, JavaScript, TypeScript, HTML, CSS, XML, Markdown, YAML, Python, Java, C, C++, Rust, Go, shell and SQL.

#### Scenario: Rust file
- **WHEN** the user opens `main.rs`
- **THEN** Rust keywords are highlighted

### Requirement: Theme-aware colours
The system SHALL render highlighting in a light or dark theme following the user's setting, with sufficient contrast.

#### Scenario: Switch theme
- **GIVEN** a highlighted document
- **WHEN** the user switches to the dark theme
- **THEN** token colours change to the dark palette without reloading the document
