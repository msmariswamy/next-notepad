# mark Specification

## Purpose
Highlight matches in five styles and bookmark lines, with marks that follow the text as it is edited.
## Requirements
### Requirement: Mark All
The system SHALL highlight every match of the search in the current document when the user clicks Mark All, using the selected mark style.

#### Scenario: Mark all matches
- **GIVEN** the text "ab ab" and the search "ab"
- **WHEN** the user clicks Mark All
- **THEN** both occurrences are highlighted

### Requirement: Five mark styles
The system SHALL provide five distinct mark styles, selectable on the Mark tab, so different searches can be highlighted in different colours at the same time.

#### Scenario: Two styles at once
- **GIVEN** "foo" marked with style 1
- **WHEN** the user marks "bar" with style 2
- **THEN** "foo" keeps style 1 and "bar" uses style 2

### Requirement: Bookmark line
The system SHALL support bookmarking the lines that contain matches, showing a gutter marker, and navigation to the next and previous bookmark.

#### Scenario: Bookmark matching lines
- **GIVEN** "Bookmark line" is selected
- **WHEN** the user clicks Mark All for "error"
- **THEN** every line containing "error" gets a gutter bookmark

#### Scenario: Navigate bookmarks
- **GIVEN** three bookmarked lines
- **WHEN** the user invokes Next Bookmark
- **THEN** the caret moves to the next bookmarked line

### Requirement: Purge for each search
The system SHALL clear previous marks of the selected style before marking when "Purge for each search" is selected.

#### Scenario: Purge before marking
- **GIVEN** "foo" is marked with style 1 and "Purge for each search" is selected
- **WHEN** the user marks "bar" with style 1
- **THEN** only "bar" remains marked in style 1

### Requirement: Clear marks
The system SHALL provide Clear all marks, clearing marks of one style or all styles, and clearing bookmarks separately.

#### Scenario: Clear all marks
- **GIVEN** matches marked in styles 1 and 2
- **WHEN** the user clicks Clear all marks
- **THEN** no highlights remain

### Requirement: Marks follow edits
The system SHALL keep marks and bookmarks attached to their text as the document is edited.

#### Scenario: Insert above a mark
- **GIVEN** a marked word on line 5
- **WHEN** the user inserts a new line above it
- **THEN** the mark and any bookmark move to line 6

