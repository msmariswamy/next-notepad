## ADDED Requirements

### Requirement: Split the editor into two panes
The system SHALL provide View > Split Vertically and Split Horizontally, which show the active document in two panes, and a command to close the split.

#### Scenario: Open a vertical split
- **GIVEN** an open document
- **WHEN** the user chooses View > Split Vertically
- **THEN** the editor shows two side-by-side panes with the same document

#### Scenario: Open a horizontal split
- **GIVEN** an open document
- **WHEN** the user chooses View > Split Horizontally
- **THEN** the editor shows two stacked panes with the same document

#### Scenario: Close the split
- **GIVEN** a split view is open
- **WHEN** the user chooses View > Close Split
- **THEN** only one pane remains and the document is unchanged

### Requirement: Panes share one document
The system SHALL keep both panes on one document: an edit in either pane SHALL appear in the other, and both panes SHALL share one undo history.

#### Scenario: Edit in the clone
- **GIVEN** a split view
- **WHEN** the user types "x" in the second pane
- **THEN** "x" also appears in the first pane

#### Scenario: Undo from either pane
- **GIVEN** the user typed "x" in the second pane
- **WHEN** the user presses Undo in the first pane
- **THEN** "x" is removed from both panes

#### Scenario: Dirty state is shared
- **GIVEN** a split view of a saved file
- **WHEN** the user edits in either pane
- **THEN** the tab is marked modified once, not twice

### Requirement: Independent cursor and scroll
The system SHALL keep a separate cursor, selection and scroll position per pane, and SHALL map each pane's selection through edits made in the other pane.

#### Scenario: Scroll independently
- **GIVEN** a long document in a split view
- **WHEN** the user scrolls the second pane
- **THEN** the first pane does not scroll

#### Scenario: Selection follows an edit above it
- **GIVEN** the caret in the first pane is on line 10
- **WHEN** the user inserts a line above it in the second pane
- **THEN** the caret in the first pane is on line 11

### Requirement: Move between panes
The system SHALL provide View > Move to Other Pane, which moves keyboard focus to the other pane.

#### Scenario: Move focus
- **GIVEN** focus is in the first pane of a split view
- **WHEN** the user chooses Move to Other Pane
- **THEN** focus and the caret are in the second pane

### Requirement: Tab switching and closing with a split
The system SHALL show the newly active tab in the first pane and close the split when the user switches tabs or closes the tab, and SHALL NOT restore the split layout on the next launch.

#### Scenario: Switch tab with a split open
- **GIVEN** a split view of tab A
- **WHEN** the user activates tab B
- **THEN** the split closes and tab B is shown in a single pane

#### Scenario: Relaunch after a split
- **GIVEN** the app was quit with a split view open
- **WHEN** the app is launched again
- **THEN** the restored tabs are shown in a single pane
