# base64-transform Specification

## Purpose
Encode and decode text as Base64 (standard and URL-safe) without ever modifying invalid input.
## Requirements
### Requirement: Base64 encode and decode commands
The system SHALL provide Edit > Base64 with Encode, Decode, Encode (URL-safe) and Decode (URL-safe), which convert text as UTF-8.

#### Scenario: Encode a selection
- **GIVEN** the selection "Hello"
- **WHEN** the user runs Base64 Encode
- **THEN** the selection becomes "SGVsbG8="

#### Scenario: Decode a selection
- **GIVEN** the selection "SGVsbG8="
- **WHEN** the user runs Base64 Decode
- **THEN** the selection becomes "Hello"

#### Scenario: Non-ASCII text round-trips
- **GIVEN** the selection "héllo €"
- **WHEN** the user runs Base64 Encode and then Base64 Decode on the result
- **THEN** the text is "héllo €" again

#### Scenario: URL-safe alphabet
- **GIVEN** text whose standard encoding contains "+" and "/"
- **WHEN** the user runs Encode (URL-safe)
- **THEN** the result uses "-" and "_" in their place

### Requirement: Scope of the operation
The system SHALL apply each command to every selection range, and to the whole document when no range is selected.

#### Scenario: No selection
- **GIVEN** a document "Hello" with an empty selection
- **WHEN** the user runs Base64 Encode
- **THEN** the whole document becomes "SGVsbG8="

#### Scenario: Multiple selections
- **GIVEN** two selected ranges "a" and "b"
- **WHEN** the user runs Base64 Encode
- **THEN** each range is encoded separately

### Requirement: Tolerant decoding
The system SHALL ignore whitespace and line breaks when decoding, and SHALL accept input with missing "=" padding.

#### Scenario: Wrapped input
- **GIVEN** a selection of base64 text split across several lines
- **WHEN** the user runs Base64 Decode
- **THEN** the lines are joined and decoded

#### Scenario: Missing padding
- **GIVEN** the selection "SGVsbG8"
- **WHEN** the user runs Base64 Decode
- **THEN** the selection becomes "Hello"

### Requirement: Invalid input is never modified
If any range cannot be decoded as valid base64 or valid UTF-8, the system SHALL leave the whole document unchanged and show a toast with the reason.

#### Scenario: Invalid characters
- **GIVEN** the selection "not base64!"
- **WHEN** the user runs Base64 Decode
- **THEN** the text is unchanged and a toast says the input is not valid base64

#### Scenario: One bad range among several
- **GIVEN** two selected ranges, one valid base64 and one invalid
- **WHEN** the user runs Base64 Decode
- **THEN** neither range is changed

#### Scenario: Bytes that are not UTF-8
- **GIVEN** a selection that decodes to bytes that are not valid UTF-8
- **WHEN** the user runs Base64 Decode
- **THEN** the text is unchanged and a toast says the result is not valid UTF-8

### Requirement: One undo step
The system SHALL apply each Base64 command as a single undo step.

#### Scenario: Undo an encode
- **GIVEN** the user encoded two selected ranges
- **WHEN** the user presses Undo once
- **THEN** both ranges return to their original text

