## ADDED Requirements

### Requirement: Document Map panel
The system SHALL provide a right-docked Document Map that draws a scaled overview of the whole active document, and a highlighted rectangle for the part currently visible.

#### Scenario: Map shows the document
- **GIVEN** a document longer than the window
- **WHEN** the Document Map is shown
- **THEN** it draws an overview of the whole document and highlights the visible part

#### Scenario: Highlight follows scrolling
- **GIVEN** the Document Map is shown
- **WHEN** the user scrolls the editor
- **THEN** the highlighted rectangle moves to match

### Requirement: Navigate with the map
The system SHALL scroll the editor when the user clicks or drags in the Document Map.

#### Scenario: Click to scroll
- **GIVEN** the Document Map is shown for a long document
- **WHEN** the user clicks near the bottom of the map
- **THEN** the editor scrolls to the matching position near the end

#### Scenario: Drag the viewport
- **GIVEN** the Document Map is shown
- **WHEN** the user drags the highlighted rectangle downward
- **THEN** the editor scrolls continuously with the drag

### Requirement: Keep the map current
The system SHALL redraw the map after edits and when the active tab changes, without blocking typing.

#### Scenario: Edit updates the map
- **GIVEN** the Document Map is shown
- **WHEN** the user adds 100 lines and pauses
- **THEN** the map reflects the longer document

### Requirement: Large document cutoff
The system SHALL turn the Document Map off for documents of more than 50,000 lines or documents above the large-file threshold, and SHALL show a notice in the panel instead of drawing.

#### Scenario: Very large document
- **GIVEN** a document of 60,000 lines
- **WHEN** the Document Map is shown
- **THEN** the panel shows a notice that the map is disabled for large documents and editing is not slowed

#### Scenario: Map returns for a small document
- **GIVEN** the map is disabled for a large tab
- **WHEN** the user activates a small tab
- **THEN** the map is drawn normally

### Requirement: Show and hide the panel
The system SHALL provide View > Document Map to show or hide the panel, and SHALL remember the choice between launches.

#### Scenario: Visibility persists
- **GIVEN** the user showed the Document Map
- **WHEN** the app is restarted
- **THEN** the Document Map is shown
