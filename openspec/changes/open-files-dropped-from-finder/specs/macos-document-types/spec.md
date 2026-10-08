## ADDED Requirements

### Requirement: The app accepts any file as an alternate handler on macOS
The macOS application bundle SHALL declare a document type that covers any file, with the app as an alternate handler. The app SHALL appear in Finder's "Open With" list and SHALL accept files dropped on its Dock or app icon. The app SHALL NOT become the default application for any file type.

#### Scenario: Bundle declares the document type
- **WHEN** the macOS application bundle is built
- **THEN** its `Info.plist` declares a catch-all document type with alternate rank

#### Scenario: Open With lists the app
- **WHEN** the user opens the context menu of a `.txt` file in Finder and chooses Open With
- **THEN** next-notepad is listed

#### Scenario: Default application is unchanged
- **GIVEN** `.txt` files open in another application when double-clicked
- **WHEN** next-notepad is installed
- **THEN** double-clicking a `.txt` file still opens the other application

### Requirement: Files opened from Finder open as tabs
The system SHALL open each file passed by Finder through Open With or a Dock-icon drop as a tab, using the same rules as File → Open and the command line, and SHALL bring the window forward.

#### Scenario: Drop on the Dock icon while running
- **GIVEN** the application is running
- **WHEN** the user drops `notes.txt` on the Dock icon
- **THEN** a tab for `notes.txt` opens

#### Scenario: Open With while running
- **GIVEN** the application is running
- **WHEN** the user chooses next-notepad from Open With for `notes.txt`
- **THEN** a tab for `notes.txt` opens

#### Scenario: Several files at once
- **WHEN** the user selects `a.txt` and `b.txt` in Finder and opens them with next-notepad
- **THEN** tabs open for both files

### Requirement: Files opened before the window is ready are not lost
The system SHALL hold files that arrive from Finder while the application is still starting and open them as soon as the window can show them.

#### Scenario: Cold launch from Finder
- **GIVEN** the application is not running
- **WHEN** the user drops `notes.txt` on the app icon in Finder
- **THEN** the application starts
- **AND** a tab for `notes.txt` opens

#### Scenario: Warm launch from Finder
- **GIVEN** the application is running and its window is minimized
- **WHEN** the user opens `notes.txt` with next-notepad from Finder
- **THEN** a tab for `notes.txt` opens
- **AND** the window is restored
