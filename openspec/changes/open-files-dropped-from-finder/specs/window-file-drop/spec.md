## ADDED Requirements

### Requirement: Dropping files on the window opens them
The system SHALL open every file dropped from the operating system (for example from Finder) anywhere on the application window as a tab, in the order the files were dropped, and SHALL activate the last file that opened. The drop SHALL use the same opening rules as File → Open.

#### Scenario: Drop one file
- **GIVEN** the application is running with one tab open
- **WHEN** the user drops `notes.txt` from Finder onto the window
- **THEN** a tab for `notes.txt` opens and becomes the active tab

#### Scenario: Drop several files
- **WHEN** the user drops `a.txt`, `b.txt` and `c.txt` together onto the window
- **THEN** three tabs open in the order `a.txt`, `b.txt`, `c.txt`
- **AND** the `c.txt` tab is active

#### Scenario: Drop anywhere on the window
- **WHEN** the user drops `a.txt` onto the tab bar, the editor or a side panel
- **THEN** a tab for `a.txt` opens

#### Scenario: File opens with its language
- **WHEN** the user drops `config.yaml` onto the window
- **THEN** the new tab uses the YAML language

### Requirement: A dropped file that is already open is focused
The system SHALL NOT open a second tab for a file that is already open. It SHALL activate the existing tab instead.

#### Scenario: Drop an open file
- **GIVEN** `a.txt` is open in a tab
- **WHEN** the user drops `a.txt` onto the window
- **THEN** no new tab is created
- **AND** the `a.txt` tab is active

#### Scenario: Drop the same file twice in one drop
- **WHEN** the user drops `a.txt` and `a.txt` together
- **THEN** exactly one `a.txt` tab exists

### Requirement: Dropped folders and unreadable files are reported
The system SHALL show an error notification naming the path for each dropped item that cannot be opened, using the wording `cannot open <path>` followed by the reason, and SHALL continue opening the remaining items.

#### Scenario: Drop a folder
- **WHEN** the user drops the folder `/work/app` onto the window
- **THEN** an error notification says `cannot open /work/app`
- **AND** no tab is created for the folder

#### Scenario: Drop a folder with files
- **WHEN** the user drops `a.txt`, the folder `/work/app` and `b.txt` together
- **THEN** tabs open for `a.txt` and `b.txt`
- **AND** one error notification names `/work/app`
- **AND** the `b.txt` tab is active

### Requirement: Large files ask before opening
The system SHALL apply the large-file confirmation to dropped files exactly as File → Open does, and a file the user declines SHALL NOT open and SHALL NOT produce an error notification.

#### Scenario: Confirm a large file
- **GIVEN** `big.log` is above the large-file threshold
- **WHEN** the user drops `big.log` and confirms the prompt
- **THEN** a tab for `big.log` opens

#### Scenario: Decline a large file
- **GIVEN** `big.log` is above the large-file threshold
- **WHEN** the user drops `a.txt` and `big.log` and declines the prompt for `big.log`
- **THEN** a tab opens for `a.txt` only
- **AND** no error notification is shown

### Requirement: Dropping is limited to the desktop app
The system SHALL handle operating-system file drops only in the desktop application. In the browser host used for development and end-to-end tests, a file dropped on the page SHALL NOT open a tab.

#### Scenario: Browser host ignores drops
- **GIVEN** the application runs in the browser host
- **WHEN** a file is dropped on the page
- **THEN** no tab is opened

### Requirement: Tab reordering keeps working
Enabling file drops SHALL NOT change dragging a tab to a new position within the tab bar.

#### Scenario: Reorder tabs by dragging
- **GIVEN** tabs `a.txt` and `b.txt` are open in that order
- **WHEN** the user drags the `b.txt` tab onto the `a.txt` tab
- **THEN** the tab order is `b.txt`, `a.txt`
- **AND** no file is opened
