# text-transforms Specification

## Purpose
Edit-menu text tools: case conversion, line operations and sorting, blank handling, indent and comments.
## Requirements
### Requirement: Convert case
The system SHALL convert the selected text (or the current word when nothing is selected) to UPPERCASE, lowercase, Proper Case, Proper Case (blend), Sentence case, Sentence case (blend), iNVERT cASE or ranDOm CasE, as an Edit > Convert Case to submenu.

#### Scenario: Uppercase and lowercase
- **GIVEN** the selection "Hello World"
- **WHEN** the user chooses UPPERCASE, then lowercase
- **THEN** the text becomes "HELLO WORLD", then "hello world"

#### Scenario: Proper case
- **GIVEN** the selection "hELLO wORLD"
- **WHEN** the user chooses Proper Case
- **THEN** the text becomes "Hello World"

#### Scenario: Proper case (blend) keeps existing capitals
- **GIVEN** the selection "hello WORLD iPhone"
- **WHEN** the user chooses Proper Case (blend)
- **THEN** the text becomes "Hello WORLD IPhone"

#### Scenario: Sentence case
- **GIVEN** the selection "hello. WORLD is here! ok"
- **WHEN** the user chooses Sentence case
- **THEN** the text becomes "Hello. World is here! Ok"

#### Scenario: Invert case
- **GIVEN** the selection "aBc"
- **WHEN** the user chooses iNVERT cASE
- **THEN** the text becomes "AbC"

#### Scenario: Random case keeps the letters
- **GIVEN** the selection "Hello World"
- **WHEN** the user chooses ranDOm CasE
- **THEN** the text has the same letters ignoring case and the same length

### Requirement: Line operations
The system SHALL provide Edit > Line Operations: Duplicate Current Line, Remove Duplicate Lines, Remove Consecutive Duplicate Lines, Split Lines, Join Lines, Move Up Current Line, Move Down Current Line, Remove Empty Lines, Remove Empty Lines (Containing Blank characters), Insert Blank Line Above Current, Insert Blank Line Below Current, Reverse Line Order and Randomize Line Order. They act on the selected lines, or on the whole document for the whole-document operations when nothing is selected.

#### Scenario: Duplicate current line
- **GIVEN** the caret on line "b" of "a\nb\nc"
- **WHEN** the user chooses Duplicate Current Line
- **THEN** the text becomes "a\nb\nb\nc"

#### Scenario: Remove duplicate lines keeps the first occurrence
- **GIVEN** the document "a\nb\na\nc\nb"
- **WHEN** the user chooses Remove Duplicate Lines
- **THEN** the text becomes "a\nb\nc"

#### Scenario: Remove consecutive duplicate lines
- **GIVEN** the document "a\na\nb\na"
- **WHEN** the user chooses Remove Consecutive Duplicate Lines
- **THEN** the text becomes "a\nb\na"

#### Scenario: Join lines
- **GIVEN** the selection of lines "a\nb\nc"
- **WHEN** the user chooses Join Lines
- **THEN** the text becomes "a b c"

#### Scenario: Move line down and up
- **GIVEN** the caret on "a" in "a\nb\nc"
- **WHEN** the user chooses Move Down Current Line
- **THEN** the text becomes "b\na\nc" and the caret stays on "a"

#### Scenario: Remove empty lines
- **GIVEN** the document "a\n\nb\n  \nc"
- **WHEN** the user chooses Remove Empty Lines
- **THEN** the text becomes "a\nb\n  \nc"
- **AND WHEN** the user chooses Remove Empty Lines (Containing Blank characters)
- **THEN** the text becomes "a\nb\nc"

#### Scenario: Insert blank line
- **GIVEN** the caret on "b" in "a\nb"
- **WHEN** the user chooses Insert Blank Line Above Current
- **THEN** the text becomes "a\n\nb"

#### Scenario: Reverse line order
- **GIVEN** the document "1\n2\n3"
- **WHEN** the user chooses Reverse Line Order
- **THEN** the text becomes "3\n2\n1"

#### Scenario: Line operations are one undo step
- **GIVEN** the user ran Remove Duplicate Lines
- **WHEN** the user invokes Undo once
- **THEN** the original lines return

### Requirement: Sort lines
The system SHALL sort the selected lines (or all lines) ascending and descending by: lexicographic order, lexicographic ignoring case, locale order, integer value, decimal value with comma separator, decimal value with dot separator, and line length.

#### Scenario: Lexicographic ascending and descending
- **GIVEN** the lines "b\nC\na"
- **WHEN** the user sorts lexicographically ascending
- **THEN** the text becomes "C\na\nb"
- **AND WHEN** the user sorts lexicographically descending
- **THEN** the text becomes "b\na\nC"

#### Scenario: Ignoring case
- **GIVEN** the lines "b\nC\na"
- **WHEN** the user sorts lexicographically ascending ignoring case
- **THEN** the text becomes "a\nb\nC"

#### Scenario: Integers sort numerically
- **GIVEN** the lines "10\n9\n100"
- **WHEN** the user sorts as integers ascending
- **THEN** the text becomes "9\n10\n100"

#### Scenario: Decimals with comma and with dot
- **GIVEN** the lines "1,5\n1,25\n10,0"
- **WHEN** the user sorts as decimals (comma) ascending
- **THEN** the text becomes "1,25\n1,5\n10,0"
- **GIVEN** the lines "1.5\n1.25\n10.0"
- **WHEN** the user sorts as decimals (dot) ascending
- **THEN** the text becomes "1.25\n1.5\n10.0"

#### Scenario: Length
- **GIVEN** the lines "ccc\na\nbb"
- **WHEN** the user sorts by length ascending
- **THEN** the text becomes "a\nbb\nccc"

#### Scenario: Sorting is stable for equal keys
- **GIVEN** the lines "b1\na\nb2" sorted by length ascending
- **THEN** "a" comes first and "b1" stays before "b2"

### Requirement: Blank operations
The system SHALL provide Edit > Blank Operations: Trim Trailing Space, Trim Leading Space, Trim Leading and Trailing Space, EOL to Space, Trim both and EOL to Space, TAB to Space, Space to TAB (All) and Space to TAB (Leading), acting on the selection or the whole document.

#### Scenario: Trim trailing space
- **GIVEN** the document "a  \n b \t"
- **WHEN** the user chooses Trim Trailing Space
- **THEN** the text becomes "a\n b"

#### Scenario: Trim leading and trailing space
- **GIVEN** the document "  a  \n\tb\t"
- **WHEN** the user chooses Trim Leading and Trailing Space
- **THEN** the text becomes "a\nb"

#### Scenario: EOL to space
- **GIVEN** the document "a\nb\nc"
- **WHEN** the user chooses EOL to Space
- **THEN** the text becomes "a b c"

#### Scenario: Tab to space and back
- **GIVEN** the tab width 4 and the line "\tx"
- **WHEN** the user chooses TAB to Space
- **THEN** the text becomes "    x"
- **AND WHEN** the user chooses Space to TAB (Leading)
- **THEN** the text becomes "\tx"

#### Scenario: Space to TAB (All) only converts whole tab stops
- **GIVEN** the tab width 4 and the line "a    b"
- **WHEN** the user chooses Space to TAB (All)
- **THEN** runs of spaces that end on a tab stop become tabs and the rest are kept

### Requirement: Indent and outdent
The system SHALL indent the selected lines with Tab (Cmd/Ctrl+]) and outdent with Shift+Tab (Cmd/Ctrl+[), using the configured indent unit, and expose both under Edit > Indent.

#### Scenario: Indent selected lines
- **GIVEN** the indent unit of two spaces and the selected lines "a\nb"
- **WHEN** the user invokes Indent
- **THEN** the text becomes "  a\n  b"

#### Scenario: Outdent
- **GIVEN** the selected lines "    a\n  b"
- **WHEN** the user invokes Outdent with indent unit two spaces
- **THEN** the text becomes "  a\nb"

### Requirement: Comment and uncomment
The system SHALL toggle line comments and block comments for languages that define them, under Edit > Comment/Uncomment.

#### Scenario: Toggle line comment in JavaScript
- **GIVEN** the language JavaScript and the selected lines "a\nb"
- **WHEN** the user toggles the line comment
- **THEN** the text becomes "// a\n// b"
- **AND WHEN** the user toggles it again
- **THEN** the original text returns

#### Scenario: Language without comments
- **GIVEN** the language Normal text
- **WHEN** the user toggles a comment
- **THEN** the text is unchanged

