## ADDED Requirements

### Requirement: YAML menu
The system SHALL provide a YAML menu with Format (2 spaces, 4 spaces), Compact, Validate and Sort Keys. Each command SHALL act on the selection, or on the whole document when nothing is selected, and SHALL be one undo step. Tab indentation SHALL NOT be offered.

#### Scenario: Whole document when nothing is selected
- **GIVEN** a YAML document and no selection
- **WHEN** the user runs YAML > Sort Keys
- **THEN** the whole document is processed

#### Scenario: One undo step
- **GIVEN** the user ran YAML > Compact
- **WHEN** the user presses Undo once
- **THEN** the document returns to its text before the command

#### Scenario: No tab option
- **WHEN** the user opens the YAML menu
- **THEN** it lists Format with 2 spaces and 4 spaces only

### Requirement: Format YAML
The system SHALL format YAML with the same formatter as Format Document, using the chosen indent of 2 or 4 spaces.

#### Scenario: Four-space indent
- **GIVEN** `a:\n  b: 1`
- **WHEN** the user runs YAML > Format (4 spaces)
- **THEN** `b` is indented by 4 spaces

#### Scenario: Comments are kept
- **GIVEN** a document with `# note` lines
- **WHEN** the user runs YAML > Format (2 spaces)
- **THEN** the comments are still in the result

### Requirement: Validate YAML
The system SHALL parse every document in the text and report the first error with its line and column, or report that the YAML is valid.

#### Scenario: Valid YAML
- **GIVEN** `a: 1\nb: [1, 2]`
- **WHEN** the user runs YAML > Validate
- **THEN** a toast says the YAML is valid

#### Scenario: Syntax error
- **GIVEN** `a: [1, 2\nb: 3`
- **WHEN** the user runs YAML > Validate
- **THEN** a toast reports an error with its line and column and the caret moves there

#### Scenario: Error in a later document
- **GIVEN** `a: 1\n---\nb: [`
- **WHEN** the user runs YAML > Validate
- **THEN** the error is reported on line 3

#### Scenario: Duplicate key
- **GIVEN** `a: 1\na: 2`
- **WHEN** the user runs YAML > Validate
- **THEN** a toast reports the duplicate key with its line

### Requirement: Invalid YAML is never modified
If the text is not valid YAML, Format, Compact, Sort Keys and conversions SHALL leave the document unchanged and show the error with its line and column.

#### Scenario: Sort on invalid YAML
- **GIVEN** `a: [1, 2\nb: 3`
- **WHEN** the user runs YAML > Sort Keys
- **THEN** the text is unchanged and a toast reports the error

### Requirement: Compact YAML to flow style
The system SHALL rewrite a single-document YAML text in flow style on one line per top-level structure with no line wrapping, and SHALL tell the user that comments were dropped when the text contained any. It SHALL refuse a text with several documents, leaving it unchanged and explaining why.

#### Scenario: Flow style
- **GIVEN** `a: 1\nb:\n  - x\n  - y`
- **WHEN** the user runs YAML > Compact
- **THEN** the text is `{ a: 1, b: [ x, y ] }`

#### Scenario: Comments dropped with a notice
- **GIVEN** `# top\na: 1 # one`
- **WHEN** the user runs YAML > Compact
- **THEN** the comments are gone and a toast says comments were dropped

#### Scenario: Anchors and aliases survive
- **GIVEN** `base: &b {x: 1}\ncopy: *b`
- **WHEN** the user runs YAML > Compact
- **THEN** the result still contains the anchor `&b` and the alias `*b`

#### Scenario: Several documents are refused
- **GIVEN** `a: 1\n---\nb: 2`
- **WHEN** the user runs YAML > Compact
- **THEN** the text is unchanged and a toast explains that multi-document YAML cannot be compacted

### Requirement: Sort YAML keys
The system SHALL sort mapping keys at every depth in ascending order, keep each comment with its key, keep list order, and preserve anchors and aliases.

#### Scenario: Keys sorted at every depth
- **GIVEN** `b: 1\na:\n  z: 1\n  y: 2`
- **WHEN** the user runs YAML > Sort Keys
- **THEN** `a` comes before `b`, and `y` before `z` inside `a`

#### Scenario: Comments stay with their key
- **GIVEN** `b: 1\n# about a\na: 2`
- **WHEN** the user runs YAML > Sort Keys
- **THEN** `# about a` is directly above `a`

#### Scenario: Lists keep their order
- **GIVEN** `k:\n  - c\n  - a\n  - b`
- **WHEN** the user runs YAML > Sort Keys
- **THEN** the list is still `c`, `a`, `b`

#### Scenario: Anchors preserved
- **GIVEN** `b: *x\na: &x 1`
- **WHEN** the user runs YAML > Sort Keys
- **THEN** the anchor `&x` and alias `*x` are still present

### Requirement: YAML selections
A YAML selection SHALL be dedented by its common leading whitespace, processed as its own document, and re-indented to the original level on every non-blank line. If it cannot be parsed alone, the text SHALL be left unchanged and the error shown.

#### Scenario: Indented block sorted in place
- **GIVEN** a document `root:\n  b: 1\n  a: 2` with the two indented lines selected
- **WHEN** the user runs YAML > Sort Keys
- **THEN** the selection is `  a: 2\n  b: 1` with its original indent and the rest of the document is unchanged

#### Scenario: Selection that is not valid alone
- **GIVEN** a selection `- a: [1`
- **WHEN** the user runs YAML > Sort Keys
- **THEN** the text is unchanged and a toast reports the error

### Requirement: Live YAML error underline
The system SHALL underline the first syntax error in a tab whose language is YAML after the user pauses typing, and SHALL NOT underline anything in tabs of other languages, in empty text, or in documents longer than 1,000,000 characters.

#### Scenario: Error is underlined
- **GIVEN** a YAML tab
- **WHEN** the user types `a: [1, 2` and pauses
- **THEN** the error position is underlined

#### Scenario: Other languages show no YAML marks
- **GIVEN** a JSON tab containing `a: [1, 2`
- **WHEN** the user pauses typing
- **THEN** no YAML underline is shown

### Requirement: Language switch
After a successful YAML command on a tab whose language is Normal text, the system SHALL set the tab's language to YAML unless the user had chosen a language manually.

#### Scenario: Plain text becomes YAML
- **GIVEN** a Normal text tab containing `a: 1`
- **WHEN** the user runs YAML > Format (2 spaces)
- **THEN** the tab's language is YAML

#### Scenario: Manual choice wins
- **GIVEN** a tab whose language the user set to Python
- **WHEN** the user runs YAML > Format (2 spaces)
- **THEN** the tab's language stays Python
