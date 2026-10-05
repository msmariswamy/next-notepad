# language-detection Specification

## Purpose
Choose the right language for a document from its content when the file name does not say.
## Requirements
### Requirement: Detect the language from content
The system SHALL detect JSON, XML, HTML, YAML and Java from the text of a document that has no recognised file extension, and set that document's language automatically.

#### Scenario: Pasted JSON in an untitled tab
- **GIVEN** an untitled tab with language Normal text
- **WHEN** the user pastes `{"a": [1, 2]}`
- **THEN** the language becomes JSON and the text is highlighted as JSON

#### Scenario: XML
- **GIVEN** an untitled tab
- **WHEN** the text becomes `<?xml version="1.0"?><root><a/></root>`
- **THEN** the language becomes XML

#### Scenario: HTML
- **GIVEN** an untitled tab
- **WHEN** the text becomes `<!DOCTYPE html><html><body></body></html>`
- **THEN** the language becomes HTML

#### Scenario: YAML
- **GIVEN** an untitled tab
- **WHEN** the text becomes "name: app\nitems:\n  - a\n  - b"
- **THEN** the language becomes YAML

#### Scenario: Java
- **GIVEN** an untitled tab
- **WHEN** the text becomes "package a;\n\npublic class Foo {\n  public static void main(String[] args) {}\n}"
- **THEN** the language becomes Java

#### Scenario: Ordinary prose stays plain text
- **GIVEN** an untitled tab
- **WHEN** the text becomes "Meeting notes: call John tomorrow."
- **THEN** the language stays Normal text

#### Scenario: File extension wins over content
- **GIVEN** a file `notes.txt` containing valid JSON
- **WHEN** it is opened
- **THEN** its language follows the extension (Normal text)

### Requirement: A manual choice is never overridden
The system SHALL stop auto-detecting for a document once the user chooses its language from the Language menu.

#### Scenario: User picks a language
- **GIVEN** the user chose Language > Python for an untitled tab
- **WHEN** the user pastes JSON
- **THEN** the language stays Python

### Requirement: Detection is cheap
The system SHALL run content detection only on documents that are still Normal text and not manually set, and only on a bounded prefix of the text, so typing in large documents is never slowed.

#### Scenario: Large document
- **GIVEN** a Normal-text document of 5 MB
- **WHEN** the user types
- **THEN** detection examines at most the first 64 KB

