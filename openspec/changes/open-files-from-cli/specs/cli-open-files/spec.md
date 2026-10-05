## ADDED Requirements

### Requirement: The next-notepad command
The system SHALL accept command-line arguments of the form `next-notepad [--wait | -w] <file>...`, plus `--help` and `--version`. With no arguments it SHALL start the application as before. With arguments it SHALL act as a client that creates no window and no Dock icon and exits with a code.

#### Scenario: Plain start
- **WHEN** the binary is started with no arguments
- **THEN** the application window opens as usual

#### Scenario: Help
- **WHEN** the user runs `next-notepad --help`
- **THEN** usage text is printed, no window opens and the exit code is 0

#### Scenario: Version
- **WHEN** the user runs `next-notepad --version`
- **THEN** the version is printed and the exit code is 0

#### Scenario: Unknown flag
- **WHEN** the user runs `next-notepad --nope`
- **THEN** usage is printed to standard error and the exit code is 2

#### Scenario: Wait flag without files
- **WHEN** the user runs `next-notepad --wait` with no file
- **THEN** usage is printed to standard error and the exit code is 2

### Requirement: Open files in the running application
When the application is running, the command SHALL ask it to open each given file, resolving relative paths against the command's own working directory, and the application SHALL show and focus its window, undoing a minimize.

#### Scenario: Open a file
- **GIVEN** the application is running
- **WHEN** the user runs `next-notepad notes.txt` in a folder containing it
- **THEN** a tab for that file opens and the window comes to the front

#### Scenario: Relative path
- **GIVEN** a shell whose working directory is `/work/app`
- **WHEN** the user runs `next-notepad ./a.yaml`
- **THEN** the tab opens `/work/app/a.yaml`

#### Scenario: Several files
- **WHEN** the user runs `next-notepad a.txt b.txt`
- **THEN** both files open in tabs

#### Scenario: Window is brought forward
- **GIVEN** the window is minimized
- **WHEN** the user runs `next-notepad a.txt`
- **THEN** the window is restored and focused

### Requirement: Start the application when it is not running
If the application is not running, the command SHALL start it detached, wait up to 10 seconds for it to accept requests, and then send the request. If the application cannot be started or reached the command SHALL print the reason to standard error and exit with code 3.

#### Scenario: Application closed
- **GIVEN** the application is not running
- **WHEN** the user runs `next-notepad a.txt`
- **THEN** the application starts and opens a tab for `a.txt`

#### Scenario: Stale server file
- **GIVEN** the application crashed and left its server file behind
- **WHEN** the user runs `next-notepad a.txt`
- **THEN** the command treats the application as not running, starts it and opens the file

#### Scenario: Cannot start
- **GIVEN** the application cannot be started
- **WHEN** the user runs `next-notepad a.txt`
- **THEN** an error is printed to standard error and the exit code is 3

### Requirement: Wait mode
With `--wait` the command SHALL not exit until every requested file's tab has been closed or the application quits, and SHALL then exit with code 0. Closing a modified tab SHALL follow the usual Save / Don't Save / Cancel prompt (or the Close-without-prompting setting).

#### Scenario: Wait until the tab closes
- **GIVEN** `next-notepad --wait f.yaml` is running
- **WHEN** the user edits, saves and closes the `f.yaml` tab
- **THEN** the command exits with code 0

#### Scenario: Still waiting while the tab is open
- **GIVEN** `next-notepad --wait f.yaml` is running
- **WHEN** the user saves `f.yaml` but leaves the tab open
- **THEN** the command is still running

#### Scenario: Several files
- **GIVEN** `next-notepad --wait a.txt b.txt` is running
- **WHEN** the user closes the `a.txt` tab only
- **THEN** the command is still running until the `b.txt` tab is also closed

#### Scenario: Application quits
- **GIVEN** `next-notepad --wait f.yaml` is running
- **WHEN** the user quits the application normally
- **THEN** the command exits with code 0

#### Scenario: Closing without saving
- **GIVEN** `next-notepad --wait f.yaml` is running and the user edited the tab
- **WHEN** the user closes the tab and chooses Don't Save
- **THEN** the file on disk is unchanged and the command exits with code 0

#### Scenario: Without wait the command returns at once
- **WHEN** the user runs `next-notepad f.yaml` without `--wait`
- **THEN** the command exits with code 0 as soon as the file is open

### Requirement: Files that do not exist, and files already open
A path that does not exist SHALL open an empty tab bound to that path, created on the first save. A file that is already open SHALL be focused instead of opened again, and a `--wait` request SHALL wait on that existing tab. If a file cannot be opened the command SHALL print the reason and exit with code 1.

#### Scenario: New file
- **WHEN** the user runs `next-notepad new.txt` and the file does not exist
- **THEN** an empty tab named `new.txt` opens and saving creates the file

#### Scenario: Already open
- **GIVEN** `a.txt` is open in a tab
- **WHEN** the user runs `next-notepad a.txt`
- **THEN** that tab is focused and no second tab opens

#### Scenario: Cannot be opened
- **WHEN** the user runs `next-notepad /some/folder`
- **THEN** the command prints that it cannot be opened and exits with code 1

### Requirement: Requests during start-up are queued
A request that arrives before the application window is ready SHALL be held and carried out when it is ready, and SHALL NOT be lost.

#### Scenario: Request while starting
- **GIVEN** the application is still starting
- **WHEN** a request to open `a.txt` arrives
- **THEN** `a.txt` opens once the window is ready

### Requirement: Local-only, authenticated requests
The server SHALL accept connections only on the loopback interface, SHALL record its port and a random token in a file in the application-data directory that only the user can read, SHALL reject a request whose token does not match, and SHALL remove the file on a clean exit.

#### Scenario: Wrong token
- **WHEN** a client sends a request with a wrong token
- **THEN** the server answers with an error, closes the connection and opens nothing

#### Scenario: Not reachable from the network
- **WHEN** another machine tries to connect to the port
- **THEN** the connection is refused because the server listens on 127.0.0.1 only

#### Scenario: Server file removed on exit
- **WHEN** the application quits normally
- **THEN** the server file no longer exists

#### Scenario: Malformed or oversized request
- **WHEN** a client sends a line that is not valid JSON or is larger than 1 MiB
- **THEN** the server answers with an error and closes the connection

### Requirement: Failures end the wait with a non-zero code
If the connection to the application drops while the command is waiting, and the application did not report that it was done, the command SHALL print a message to standard error and exit with code 1.

#### Scenario: Application crashes
- **GIVEN** `next-notepad --wait f.yaml` is running
- **WHEN** the application process is killed
- **THEN** the command prints a message and exits with code 1

### Requirement: Exit codes
The command SHALL exit with 0 on success, 1 for other failures, 2 for a usage error, and 3 when the application cannot be started or reached.

#### Scenario: Success
- **WHEN** a request completes
- **THEN** the exit code is 0

### Requirement: macOS open events
On macOS, files opened through the system (`open -a next-notepad file`, or dropping a file on the Dock icon) SHALL open through the same path as the command without `--wait`.

#### Scenario: open -a
- **GIVEN** the application is running on macOS
- **WHEN** the user runs `open -a next-notepad notes.txt`
- **THEN** `notes.txt` opens in a tab and the window is focused

### Requirement: Windows console output
On Windows the command SHALL attach to the console of the process that started it so that help, version and error messages appear there.

#### Scenario: Help in a terminal
- **GIVEN** a Windows terminal
- **WHEN** the user runs `next-notepad --help`
- **THEN** the usage text appears in that terminal
