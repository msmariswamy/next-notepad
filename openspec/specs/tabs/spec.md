# tabs Specification

## Purpose
Tabbed documents with modified indicators and the choice of prompting or silently keeping unsaved text on close.
## Requirements
### Requirement: Tabbed documents
The system SHALL show every open document as a tab, and allow creating, switching, reordering and closing tabs.

#### Scenario: New tab
- **WHEN** the user creates a new document
- **THEN** a tab titled "new N" opens, with N one higher than the highest existing untitled number, and becomes active

#### Scenario: Switch tabs
- **GIVEN** several open tabs
- **WHEN** the user selects another tab
- **THEN** that tab's content is shown and its tab is highlighted

### Requirement: Dirty indicator
The system SHALL mark a tab as modified when its content differs from the last saved state.

#### Scenario: Edit marks tab dirty
- **GIVEN** a clean tab
- **WHEN** the user types a character
- **THEN** the tab shows the modified indicator

#### Scenario: Save clears indicator
- **GIVEN** a dirty saved-file tab
- **WHEN** the user saves
- **THEN** the modified indicator clears

### Requirement: Close prompt
When the `silentClose` setting is off, the system SHALL ask whether to save before closing a tab with unsaved changes, offering Save, Don't Save and Cancel.

#### Scenario: Close dirty tab with prompt
- **GIVEN** `silentClose` is off and a dirty tab
- **WHEN** the user closes the tab
- **THEN** a prompt offers Save, Don't Save and Cancel

#### Scenario: Cancel keeps tab open
- **GIVEN** the close prompt is shown
- **WHEN** the user chooses Cancel
- **THEN** the tab stays open with its content intact

### Requirement: Silent close
When the `silentClose` setting is on, the system SHALL close a dirty tab without prompting and SHALL keep its content in a bounded recently-closed list in the session store.

#### Scenario: Silent close retains content
- **GIVEN** `silentClose` is on and a dirty tab with text
- **WHEN** the user closes the tab
- **THEN** no prompt appears and the text is recoverable from the recently-closed list

### Requirement: Closing a clean tab
The system SHALL close a clean tab immediately without a prompt.

#### Scenario: Close clean tab
- **GIVEN** a tab with no unsaved changes
- **WHEN** the user closes it
- **THEN** the tab closes with no prompt

