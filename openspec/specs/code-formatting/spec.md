# code-formatting Specification

## Purpose
Re-indent and re-format code in the supported languages with one command, safely and as a single undo step.
## Requirements
### Requirement: Format document
The system SHALL provide a Format Document command (Edit > Format, Cmd/Ctrl+Alt+L) that re-indents and re-formats the current document or selection according to its language: JSON, JavaScript, TypeScript, HTML, CSS, XML, YAML and Java, using the configured tab width.

#### Scenario: Format JavaScript
- **GIVEN** the language JavaScript and the text `function f(){return 1}`
- **WHEN** the user runs Format Document
- **THEN** the code is reformatted onto separate, indented lines

#### Scenario: Format HTML
- **GIVEN** the language HTML and the text `<div><p>Hi</p></div>`
- **WHEN** the user runs Format Document
- **THEN** each element is placed on its own indented line

#### Scenario: Format XML
- **GIVEN** the language XML and the text `<a><b>1</b><c/></a>`
- **WHEN** the user runs Format Document
- **THEN** the elements are nested with indentation

#### Scenario: Format YAML
- **GIVEN** the language YAML and the text with inconsistent indentation
- **WHEN** the user runs Format Document
- **THEN** the YAML is re-indented consistently

#### Scenario: Format Java
- **GIVEN** the language Java and the text `class A{void f(){int x=1;}}`
- **WHEN** the user runs Format Document
- **THEN** the braces open new indented blocks

#### Scenario: Format CSS
- **GIVEN** the language CSS and the text `a{color:red}`
- **WHEN** the user runs Format Document
- **THEN** the declaration is on its own indented line

### Requirement: Auto-detect, then format
When the document's language is Normal text, Format Document SHALL first detect the language from the content (JSON, XML, HTML, YAML, Java), set it, and then format.

#### Scenario: Untitled JSON
- **GIVEN** an untitled tab with `{"a":1}` and language Normal text
- **WHEN** the user runs Format Document
- **THEN** the language becomes JSON and the text is pretty-printed

#### Scenario: Unrecognised content
- **GIVEN** an untitled tab with ordinary prose
- **WHEN** the user runs Format Document
- **THEN** a message says the language could not be detected and the text is unchanged

### Requirement: Invalid code is never modified
If the formatter cannot parse the text, the system SHALL leave the text unchanged and show the error with its line and column where available.

#### Scenario: Syntax error
- **GIVEN** the language JavaScript and the text `function (`
- **WHEN** the user runs Format Document
- **THEN** the text is unchanged and a message describes the syntax error

### Requirement: Formatting is one undo step
The system SHALL apply a format as a single edit, so one Undo restores the previous text.

#### Scenario: Undo a format
- **GIVEN** the user ran Format Document
- **WHEN** the user invokes Undo once
- **THEN** the unformatted text returns

### Requirement: Formatters load on demand
The system SHALL load each formatter only when first used, so application start-up does not pay for it.

#### Scenario: First use
- **GIVEN** the app has just started
- **THEN** no formatter code has been loaded until a format command runs

