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
The system SHALL document that formatting parses and re-serialises the data, so duplicate keys collapse to a single key holding the last value, while number text, string escapes and key order are kept exactly as written.

#### Scenario: Duplicate keys
- **GIVEN** a document `{"a":1,"a":2}`
- **WHEN** the user invokes Pretty-print
- **THEN** the result contains key "a" once with the value 2

#### Scenario: Numbers and key order are preserved
- **GIVEN** a document `{"2":1.0,"1":12345678901234567890}`
- **WHEN** the user invokes Pretty-print
- **THEN** the keys stay in the order "2", "1" and both numbers keep their original text

### Requirement: JSON menu commands
The system SHALL provide a JSON menu with Pretty-print (2 spaces), Pretty-print (4 spaces), Pretty-print (tabs), Compress (the same as Minify), Sort Keys (ascending, recursive), Escape as JSON String, Unescape JSON String and Validate.

#### Scenario: Pretty-print with 4 spaces and with tabs
- **GIVEN** the document `{"a":1}`
- **WHEN** the user chooses Pretty-print (4 spaces)
- **THEN** the key is indented with four spaces
- **AND WHEN** the user chooses Pretty-print (tabs)
- **THEN** the key is indented with one tab

#### Scenario: Compress
- **GIVEN** an indented JSON document
- **WHEN** the user chooses Compress
- **THEN** the document becomes one line without insignificant whitespace

#### Scenario: Sort keys
- **GIVEN** the document `{"b":1,"a":{"d":1,"c":2}}`
- **WHEN** the user chooses Sort Keys
- **THEN** the keys are ordered a, b at the top level and c, d inside "a"

#### Scenario: Escape and unescape as a JSON string
- **GIVEN** the selection `say "hi"` followed by a newline
- **WHEN** the user chooses Escape as JSON String
- **THEN** the selection becomes `"say \"hi\"\n"`
- **AND WHEN** the user chooses Unescape JSON String
- **THEN** the original text returns

### Requirement: Format JSON from any JSON-looking text
Pretty-print and Compress SHALL work on a document whose language is not yet JSON when the content is valid JSON, and SHALL set the language to JSON.

#### Scenario: Untitled tab
- **GIVEN** an untitled tab with `{"a":1}`
- **WHEN** the user chooses JSON > Pretty-print
- **THEN** the text is pretty-printed and the language is JSON
