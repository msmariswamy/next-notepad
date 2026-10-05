# bookmark-lines Specification

## Purpose
Act on bookmarked lines in bulk: copy, cut, replace, remove, remove the others, or invert the bookmarks.
## Requirements
### Requirement: Bookmarked-line operations
The system SHALL provide Search > Bookmark commands to Cut Bookmarked Lines, Copy Bookmarked Lines, Paste to (Replace) Bookmarked Lines, Remove Bookmarked Lines, Remove Non-Bookmarked Lines and Inverse Bookmarks.

#### Scenario: Copy bookmarked lines
- **GIVEN** the document "a\nb\nc" with lines 1 and 3 bookmarked
- **WHEN** the user chooses Copy Bookmarked Lines
- **THEN** the clipboard holds "a\nc" and the document is unchanged

#### Scenario: Cut bookmarked lines
- **GIVEN** the document "a\nb\nc" with lines 1 and 3 bookmarked
- **WHEN** the user chooses Cut Bookmarked Lines
- **THEN** the clipboard holds "a\nc" and the document becomes "b"

#### Scenario: Remove bookmarked lines
- **GIVEN** the document "a\nb\nc" with line 2 bookmarked
- **WHEN** the user chooses Remove Bookmarked Lines
- **THEN** the document becomes "a\nc"

#### Scenario: Remove non-bookmarked lines
- **GIVEN** the document "a\nb\nc" with line 2 bookmarked
- **WHEN** the user chooses Remove Non-Bookmarked Lines
- **THEN** the document becomes "b"

#### Scenario: Paste to (replace) bookmarked lines
- **GIVEN** the clipboard "X" and the document "a\nb\nc" with line 2 bookmarked
- **WHEN** the user chooses Paste to (Replace) Bookmarked Lines
- **THEN** the document becomes "a\nX\nc"

#### Scenario: Inverse bookmarks
- **GIVEN** the document "a\nb\nc" with line 2 bookmarked
- **WHEN** the user chooses Inverse Bookmarks
- **THEN** lines 1 and 3 are bookmarked and line 2 is not

#### Scenario: No bookmarks
- **GIVEN** a document without bookmarks
- **WHEN** the user chooses Remove Bookmarked Lines
- **THEN** the document is unchanged and a message says there are no bookmarks

#### Scenario: Bookmarked-line edits are one undo step
- **GIVEN** the user ran Remove Bookmarked Lines
- **WHEN** the user invokes Undo once
- **THEN** the removed lines return

