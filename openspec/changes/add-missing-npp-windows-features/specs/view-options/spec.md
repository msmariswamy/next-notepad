## ADDED Requirements

### Requirement: Side panel toggles
The system SHALL provide View > Function List and View > Document Map as checkable items that show or hide the matching right-docked panel, SHALL default both panels to hidden, and SHALL persist each choice in settings.

#### Scenario: Panels are hidden by default
- **GIVEN** a first launch with no settings file
- **WHEN** the app starts
- **THEN** neither the Function List nor the Document Map is shown

#### Scenario: Toggle a panel
- **WHEN** the user checks View > Function List
- **THEN** the Function List panel is shown and the menu item is checked

#### Scenario: Older settings file
- **GIVEN** a settings file written by a version without panel settings
- **WHEN** the app starts
- **THEN** it loads without error and both panels are hidden
