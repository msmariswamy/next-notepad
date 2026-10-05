# find-in-files Specification

## Purpose
TBD - created by archiving change macos-flutter-notepad. Update Purpose after archive.
## Requirements
### Requirement: Find in Files
The system SHALL search all files in a chosen directory, with a file-name filter, optional "In all sub-folders" and "In hidden folders" toggles, and the same Normal, Extended and Regular expression modes and match options as in-editor search.

#### Scenario: Search a directory
- **GIVEN** a directory with three files containing "TODO" and filter `*.txt`
- **WHEN** the user runs Find All in Files for "TODO"
- **THEN** the results panel lists each match with path, line number and line text

#### Scenario: Sub-folder toggle
- **GIVEN** "In all sub-folders" is cleared
- **WHEN** the user searches a directory containing nested folders
- **THEN** only files directly in the chosen directory are searched

#### Scenario: Hidden folders skipped by default
- **GIVEN** "In hidden folders" is cleared
- **WHEN** the user searches a directory containing a `.git` folder
- **THEN** files inside `.git` are not searched

### Requirement: Replace in Files
The system SHALL support Replace in Files across the filtered file set, and SHALL ask for confirmation showing the number of files affected before writing.

#### Scenario: Confirm before replacing
- **GIVEN** a Replace in Files request that would modify 12 files
- **WHEN** the user clicks Replace in Files
- **THEN** a confirmation states 12 files will be changed and nothing is written until confirmed

### Requirement: Find in Projects
The system SHALL treat the folder opened with "Open Folder" as the project root, and the Find in Projects tab SHALL search that root with the same filters as Find in Files.

#### Scenario: Search project root
- **GIVEN** the user opened a folder via "Open Folder"
- **WHEN** the user runs Find in Projects for "main"
- **THEN** only files under that folder are searched

#### Scenario: No folder opened
- **GIVEN** no folder has been opened
- **WHEN** the user opens the Find in Projects tab
- **THEN** the search controls are disabled with a prompt to open a folder

### Requirement: Cross-engine consistency
The system SHALL give equivalent match results whether a search runs in the Rust engine or in the JavaScript engine. A pattern that uses lookahead, lookbehind or backreferences SHALL be matched with the JavaScript engine over file contents read by the backend.

#### Scenario: Lookahead pattern
- **GIVEN** a file containing "foobar foobaz"
- **WHEN** the user runs Find in Files with regex `foo(?=bar)`
- **THEN** exactly one match is reported and no engine error appears

#### Scenario: Same result on both paths
- **GIVEN** a plain pattern eligible for the Rust engine
- **WHEN** the same pattern is run through the JavaScript engine over the same text
- **THEN** both report identical match positions

### Requirement: Streaming and cancellation
The system SHALL stream results as they are found and SHALL allow the user to cancel a running search.

#### Scenario: Cancel a long search
- **GIVEN** a search over a large directory is running
- **WHEN** the user clicks Cancel
- **THEN** the search stops and the partial results remain listed

### Requirement: Binary and unreadable files
The system SHALL skip binary files and files it cannot read, and SHALL report the count of skipped files.

#### Scenario: Binary file in directory
- **GIVEN** a directory containing a PNG and a text file
- **WHEN** the user searches the directory
- **THEN** the PNG is skipped and the summary notes one skipped file

