## ADDED Requirements

### Requirement: Pretty-print JSON
The system SHALL reformat the current document, or the selection, as indented JSON when the user invokes Pretty-print.

#### Scenario: Format minified JSON
- **GIVEN** a document containing `{"a":1,"b":[1,2]}`
- **WHEN** the user invokes Pretty-print
- **THEN** the document is replaced with a multi-line, indented equivalent

#### Scenario: Invalid JSON is not modified
- **GIVEN** a document containing `{"a":`
- **WHEN** the user invokes Pretty-print
- **THEN** the document is unchanged and the error position is reported

### Requirement: Minify JSON
The system SHALL remove insignificant whitespace from the current document, or the selection, when the user invokes Minify.

#### Scenario: Minify formatted JSON
- **GIVEN** an indented multi-line JSON document
- **WHEN** the user invokes Minify
- **THEN** the document becomes a single line with the same data

### Requirement: Validate JSON with error position
The system SHALL validate the document as JSON and report the line and column of the first error, moving the caret to it.

#### Scenario: Error position
- **GIVEN** a document with a missing comma on line 3, column 8
- **WHEN** the user invokes Validate
- **THEN** a message reports line 3, column 8 and the caret moves there

#### Scenario: Valid JSON
- **GIVEN** a well-formed JSON document
- **WHEN** the user invokes Validate
- **THEN** a message reports that the JSON is valid

### Requirement: Single undo step
The system SHALL apply Pretty-print and Minify as a single undoable edit.

#### Scenario: Undo format
- **GIVEN** the user pretty-printed a document
- **WHEN** the user invokes Undo once
- **THEN** the original text returns

### Requirement: Documented side effects
The system SHALL document that formatting parses and re-serialises the data, so duplicate keys collapse and number formatting is normalised.

#### Scenario: Duplicate keys
- **GIVEN** a document `{"a":1,"a":2}`
- **WHEN** the user invokes Pretty-print
- **THEN** the result contains key "a" once with the value 2
