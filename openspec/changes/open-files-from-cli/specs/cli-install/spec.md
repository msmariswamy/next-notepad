## ADDED Requirements

### Requirement: Command Line Tool dialog
The system SHALL provide Help > "Command Line Tool…", which shows the path of the running executable and ready-to-paste `KUBE_EDITOR` text for the current platform, each with a button that copies it to the clipboard.

#### Scenario: Dialog shows the executable path
- **WHEN** the user opens Help > Command Line Tool…
- **THEN** the dialog shows the full path of the next-notepad executable

#### Scenario: Copy the setting
- **WHEN** the user presses the copy button next to the `KUBE_EDITOR` text
- **THEN** that text is on the clipboard and a confirmation appears

### Requirement: KUBE_EDITOR text
The system SHALL show the setting as `export KUBE_EDITOR="<command> --wait"` for shells on macOS, and as `$env:KUBE_EDITOR = '<command> --wait'` for PowerShell and `setx KUBE_EDITOR "<command> --wait"` for the Windows command prompt, quoting the executable path when it contains spaces. When the command is installed on `PATH` the macOS text SHALL use `next-notepad`.

#### Scenario: Path with spaces
- **GIVEN** the executable path is `/Applications/Next Notepad.app/Contents/MacOS/next-notepad`
- **WHEN** the dialog is open on macOS
- **THEN** the text quotes that path and ends with `--wait`

#### Scenario: Windows forms
- **GIVEN** the executable is `C:\Program Files\next-notepad\next-notepad.exe`
- **WHEN** the dialog is open on Windows
- **THEN** both the PowerShell and the `setx` text quote the path and end with `--wait`

#### Scenario: Installed on PATH
- **GIVEN** the macOS command is installed
- **WHEN** the dialog is open
- **THEN** the text is `export KUBE_EDITOR="next-notepad --wait"`

### Requirement: Install the command on macOS
On macOS the dialog SHALL offer an Install button that creates a symlink named `next-notepad` to the executable, in `/usr/local/bin` when that folder is writable and otherwise in `~/.local/bin` (created if needed). It SHALL replace a symlink it created earlier, SHALL NOT overwrite any other file, and SHALL report where the link was created and, when that folder is not on `PATH`, how to add it. On other platforms no Install button is shown.

#### Scenario: Install into a writable folder
- **GIVEN** `/usr/local/bin` is writable
- **WHEN** the user presses Install
- **THEN** `/usr/local/bin/next-notepad` links to the executable and the dialog says so

#### Scenario: Fall back to the home folder
- **GIVEN** `/usr/local/bin` is not writable
- **WHEN** the user presses Install
- **THEN** `~/.local/bin/next-notepad` links to the executable

#### Scenario: Folder not on PATH
- **GIVEN** the chosen folder is not on `PATH`
- **WHEN** the install succeeds
- **THEN** the dialog shows the line to add the folder to `PATH`

#### Scenario: Reinstall after the app moved
- **GIVEN** a symlink made earlier points at an old location
- **WHEN** the user presses Install again
- **THEN** the link points at the current executable

#### Scenario: Never overwrite another file
- **GIVEN** a regular file named `next-notepad` already exists in the target folder
- **WHEN** the user presses Install
- **THEN** the file is untouched and the dialog explains why nothing was installed

#### Scenario: Windows has no Install button
- **WHEN** the dialog is open on Windows
- **THEN** it shows the executable path and the settings text but no Install button
