## ADDED Requirements

### Requirement: Find dialog tabs
The system SHALL provide a Find dialog with the tabs Find, Replace, Find in Files, Find in Projects and Mark, reachable from the Search menu and keyboard shortcuts.

#### Scenario: Open Replace tab
- **WHEN** the user invokes the Replace shortcut
- **THEN** the dialog opens on the Replace tab with the selection prefilled in "Find what"

### Requirement: Find Next and backward direction
The system SHALL search forward by default and backward when "Backward direction" is selected, moving the selection to the next match.

#### Scenario: Find next forward
- **GIVEN** the text "a b a" with the caret at the start
- **WHEN** the user searches for "a" with Find Next twice
- **THEN** the second match at index 4 is selected

#### Scenario: Backward search
- **GIVEN** "Backward direction" is selected and the caret at the end
- **WHEN** the user clicks Find Next
- **THEN** the closest match before the caret is selected

### Requirement: Match options
The system SHALL support "Match whole word only", "Match case" and "Wrap around".

#### Scenario: Whole word
- **GIVEN** the text "cat concat" and "Match whole word only" selected
- **WHEN** the user finds "cat"
- **THEN** only the standalone word "cat" matches

#### Scenario: Case sensitivity
- **GIVEN** "Match case" is cleared and the text "Foo foo"
- **WHEN** the user counts "foo"
- **THEN** the count is 2

#### Scenario: Wrap around
- **GIVEN** "Wrap around" is selected and the caret after the last match
- **WHEN** the user clicks Find Next
- **THEN** the first match in the document is selected

### Requirement: Search modes
The system SHALL support Normal, Extended and Regular expression search modes. Extended mode SHALL interpret `\n`, `\r`, `\t`, `\0` and `\xNN`. Regular expression mode SHALL offer a ". matches newline" option.

#### Scenario: Extended newline
- **GIVEN** Extended mode and the text "a" newline "b"
- **WHEN** the user finds `a\nb`
- **THEN** the two-line text matches

#### Scenario: Regex dot and newline
- **GIVEN** Regular expression mode with ". matches newline" cleared
- **WHEN** the user finds `a.b` in "a" newline "b"
- **THEN** there is no match

#### Scenario: Invalid regex
- **GIVEN** Regular expression mode
- **WHEN** the user enters `(unclosed`
- **THEN** an inline error is shown and the editor is not changed

### Requirement: In selection
The system SHALL restrict Find, Count and Replace All to the current selection when "In selection" is selected.

#### Scenario: Replace in selection
- **GIVEN** "In selection" selected and two lines of which only the first is selected
- **WHEN** the user clicks Replace All for "x" to "y"
- **THEN** only the matches within the selection are replaced

### Requirement: Count and Find All
The system SHALL provide Count, Find All in Current Document and Find All in All Opened Documents, listing results with file, line number and line text in a results panel.

#### Scenario: Count
- **GIVEN** the text "ab ab ab"
- **WHEN** the user clicks Count for "ab"
- **THEN** the dialog reports 3 matches

#### Scenario: Find All in all opened documents
- **GIVEN** two open tabs that each contain "todo"
- **WHEN** the user clicks Find All in All Opened Documents
- **THEN** the results panel lists matches grouped by document

#### Scenario: Result navigation
- **GIVEN** the results panel lists matches
- **WHEN** the user double-clicks a result
- **THEN** the document is activated and the match is selected

### Requirement: Replace and Replace All
The system SHALL provide Replace, Replace All, and Replace All in All Opened Documents. In Regular expression mode the replacement SHALL accept `\1` through `\9` and `$1` through `$9` capture references.

#### Scenario: Replace with capture groups
- **GIVEN** Regular expression mode, find `(\w+) (\w+)`, replace `\2 \1`
- **WHEN** the user clicks Replace All on "hello world"
- **THEN** the text becomes "world hello"

#### Scenario: Replace All is one undo step
- **GIVEN** Replace All changed five matches
- **WHEN** the user invokes Undo once
- **THEN** all five replacements are reverted

#### Scenario: Replace All in all opened documents
- **GIVEN** two open tabs containing "foo"
- **WHEN** the user clicks Replace All in All Opened Documents
- **THEN** both tabs are updated and marked modified

### Requirement: Search history
The system SHALL remember recent "Find what" and "Replace with" entries in a dropdown for the session and across restarts.

#### Scenario: Reuse earlier search
- **GIVEN** the user previously searched for "foo"
- **WHEN** the user opens the "Find what" dropdown
- **THEN** "foo" is listed

### Requirement: Transparency
The system SHALL provide a Transparency option for the dialog, applied on losing focus or always, with an adjustable level.

#### Scenario: Transparent on losing focus
- **GIVEN** transparency "On losing focus" is selected
- **WHEN** the dialog loses focus
- **THEN** the dialog becomes translucent and returns to opaque when focused
