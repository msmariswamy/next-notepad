# settings Specification

## Purpose
TBD - created by archiving change macos-flutter-notepad. Update Purpose after archive.
## Requirements
### Requirement: Settings dialog
The system SHALL provide a Settings dialog, reachable from the menu and a keyboard shortcut, that persists changes immediately.

#### Scenario: Change a setting
- **WHEN** the user changes a setting and closes the dialog
- **THEN** the new value takes effect and is still applied after restart

### Requirement: Silent close option
The system SHALL provide a `silentClose` setting that defaults to off. When off, closing a dirty tab or quitting prompts for each dirty tab. When on, closing and quitting happen without prompts and unsaved text is preserved in the session store.

#### Scenario: Default is prompting
- **GIVEN** a fresh install
- **WHEN** the user closes a dirty tab
- **THEN** a save prompt appears

#### Scenario: Enable silent close
- **GIVEN** the user turned `silentClose` on
- **WHEN** the user quits with dirty tabs
- **THEN** no prompt appears and the tabs are restored on the next launch

### Requirement: Stored in app-data directory
The system SHALL store settings as a JSON file in the platform's app-data directory, written atomically.

#### Scenario: Settings file location
- **WHEN** the user changes a setting
- **THEN** the settings file in the app-data directory contains the new value

### Requirement: Corrupt settings fall back to defaults
If the settings file is missing or invalid, the system SHALL use default values and SHALL preserve the invalid file with a `.corrupt` suffix.

#### Scenario: Invalid settings file
- **GIVEN** the settings file contains invalid JSON
- **WHEN** the app launches
- **THEN** defaults are applied, the file is renamed with `.corrupt`, and no crash occurs

### Requirement: Appearance and editor options
The system SHALL provide settings for theme (light, dark, system), font family and size, word wrap, show whitespace, and large-file warning threshold.

#### Scenario: Change font size
- **WHEN** the user sets the font size to 16
- **THEN** all open editors render at 16 px

