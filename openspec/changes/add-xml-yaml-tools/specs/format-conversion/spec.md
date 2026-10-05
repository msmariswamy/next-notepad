## ADDED Requirements

### Requirement: Conversion commands
The system SHALL provide Convert to YAML and Convert to XML in the JSON menu, Convert to JSON in the YAML menu, and Convert to JSON in the XML menu. Each SHALL convert the selection, or the whole document when nothing is selected, and SHALL open the result in a new untitled tab whose language is the target format, leaving the original tab and its text unchanged.

#### Scenario: Result opens in a new tab
- **GIVEN** a JSON tab containing `{"a": 1}`
- **WHEN** the user runs JSON > Convert to YAML
- **THEN** a new untitled tab opens containing `a: 1` with language YAML and the JSON tab is unchanged

#### Scenario: Selection only
- **GIVEN** a document with the selected text `{"a": 1}` among other text
- **WHEN** the user runs JSON > Convert to YAML
- **THEN** only the selected text is converted

#### Scenario: Language is not overridden
- **GIVEN** a converted tab with language JSON
- **WHEN** the user edits its text
- **THEN** content detection does not change the tab's language

#### Scenario: Conversions are not recorded in macros
- **GIVEN** a macro is being recorded
- **WHEN** the user runs a Convert command
- **THEN** the command runs, is not recorded, and a toast says it cannot be recorded

### Requirement: Invalid input is never converted
If the source text is not valid in its format, the system SHALL NOT open a tab and SHALL show the error with its line and column.

#### Scenario: Invalid JSON
- **GIVEN** `{"a": }`
- **WHEN** the user runs JSON > Convert to YAML
- **THEN** no tab opens and a toast reports the JSON error with its line and column

#### Scenario: Invalid YAML
- **GIVEN** `a: [1, 2`
- **WHEN** the user runs YAML > Convert to JSON
- **THEN** no tab opens and a toast reports the YAML error

### Requirement: JSON to YAML
The system SHALL convert JSON to block-style YAML with a 2-space indent, keeping key order and the written text of numbers.

#### Scenario: Nested data
- **GIVEN** `{"name": "x", "list": [1, 2], "o": {"k": true}}`
- **WHEN** the user runs JSON > Convert to YAML
- **THEN** the result is `name: x\nlist:\n  - 1\n  - 2\no:\n  k: true`

#### Scenario: Key order kept
- **GIVEN** `{"b": 1, "a": 2}`
- **WHEN** the user runs JSON > Convert to YAML
- **THEN** `b` is before `a`

#### Scenario: Large integers keep their digits
- **GIVEN** `{"id": 12345678901234567890}`
- **WHEN** the user runs JSON > Convert to YAML
- **THEN** the result contains `12345678901234567890`

#### Scenario: Strings that look like other types are quoted
- **GIVEN** `{"a": "true", "b": "123", "c": "null"}`
- **WHEN** the user runs JSON > Convert to YAML
- **THEN** each value is quoted so that parsing the YAML gives the same strings

### Requirement: YAML to JSON
The system SHALL convert YAML to JSON with a 2-space indent. A single document becomes its value and several documents become an array in order. Anchors and aliases SHALL be expanded. Comments SHALL be dropped, and a toast SHALL say so when there were any. Mapping keys that are not strings SHALL become strings, with a warning when that changes their meaning. Values that JSON cannot hold (`.nan`, `.inf`) SHALL be an error naming the key path. An integer outside the exact range of JSON numbers SHALL produce a warning.

#### Scenario: Single document
- **GIVEN** `a: 1\nb: [x, y]`
- **WHEN** the user runs YAML > Convert to JSON
- **THEN** the result is `{"a": 1, "b": ["x", "y"]}` formatted with a 2-space indent

#### Scenario: Several documents
- **GIVEN** `a: 1\n---\nb: 2`
- **WHEN** the user runs YAML > Convert to JSON
- **THEN** the result is an array of the two objects

#### Scenario: Aliases expanded
- **GIVEN** `base: &b {x: 1}\ncopy: *b`
- **WHEN** the user runs YAML > Convert to JSON
- **THEN** `copy` holds the same object as `base`

#### Scenario: Comments dropped with a notice
- **GIVEN** `# note\na: 1`
- **WHEN** the user runs YAML > Convert to JSON
- **THEN** the result has no comment and a toast says comments were dropped

#### Scenario: Non-string key
- **GIVEN** `1: one\ntrue: two`
- **WHEN** the user runs YAML > Convert to JSON
- **THEN** the keys are `"1"` and `"true"` and a toast warns that keys were converted

#### Scenario: Value JSON cannot hold
- **GIVEN** `n: .nan`
- **WHEN** the user runs YAML > Convert to JSON
- **THEN** no tab opens and a toast says `n` cannot be represented in JSON

#### Scenario: Alias bomb is refused
- **GIVEN** a YAML document whose aliases expand to more than the alias limit
- **WHEN** the user runs YAML > Convert to JSON
- **THEN** no tab opens and a toast explains the document expands too much

### Requirement: XML to JSON
The system SHALL convert XML to JSON using these rules: the root element's name is the top-level key; attributes are `@name` keys; repeated sibling elements become an array; an element with only text becomes a string; an empty element becomes an empty string; CDATA and entities become plain text; namespace prefixes are kept in names. Text mixed with child elements SHALL be joined into a `#text` key and reported as lossy. Comments and processing instructions SHALL be dropped, and a toast SHALL say so when there were any.

#### Scenario: Attributes, text and children
- **GIVEN** `<book id="1"><title>A</title><author>B</author></book>`
- **WHEN** the user runs XML > Convert to JSON
- **THEN** the result is `{"book": {"@id": "1", "title": "A", "author": "B"}}`

#### Scenario: Repeated elements become an array
- **GIVEN** `<l><i>1</i><i>2</i></l>`
- **WHEN** the user runs XML > Convert to JSON
- **THEN** `i` is `["1", "2"]`

#### Scenario: Text with attributes
- **GIVEN** `<p lang="en">hello</p>`
- **WHEN** the user runs XML > Convert to JSON
- **THEN** the result is `{"p": {"@lang": "en", "#text": "hello"}}`

#### Scenario: Empty element
- **GIVEN** `<a><b/></a>`
- **WHEN** the user runs XML > Convert to JSON
- **THEN** `b` is `""`

#### Scenario: CDATA and entities
- **GIVEN** `<a><![CDATA[1 < 2]]> &amp; more</a>`
- **WHEN** the user runs XML > Convert to JSON
- **THEN** the text is `1 < 2 & more`

#### Scenario: Mixed content is reported
- **GIVEN** `<p>Hello <b>big</b> world</p>`
- **WHEN** the user runs XML > Convert to JSON
- **THEN** the text parts are joined into `#text` and a toast says mixed content was flattened

#### Scenario: Comments dropped with a notice
- **GIVEN** `<a><!-- x --><b/></a>`
- **WHEN** the user runs XML > Convert to JSON
- **THEN** the result has no comment and a toast says comments were dropped

#### Scenario: Namespace prefixes kept
- **GIVEN** `<x:a xmlns:x="u"><x:b/></x:a>`
- **WHEN** the user runs XML > Convert to JSON
- **THEN** the keys are `x:a`, `@xmlns:x` and `x:b`

#### Scenario: Several roots in a selection
- **GIVEN** a selection `<a/><b/>`
- **WHEN** the user runs XML > Convert to JSON
- **THEN** the result is one object with the keys `a` and `b`

### Requirement: JSON to XML
The system SHALL convert JSON to XML with the reverse rules: a top-level object with exactly one key and a non-array value gives the root element, otherwise the result is wrapped in `<root>`; `@name` keys become attributes; `#text` becomes text; arrays become repeated elements; scalars become escaped text; `null` becomes an empty element. The result SHALL be indented with 2 spaces. A key that is not a valid XML name SHALL be an error naming its path.

#### Scenario: Single key is the root
- **GIVEN** `{"book": {"@id": "1", "title": "A"}}`
- **WHEN** the user runs JSON > Convert to XML
- **THEN** the result is `<book id="1">\n  <title>A</title>\n</book>`

#### Scenario: Several keys are wrapped
- **GIVEN** `{"a": 1, "b": 2}`
- **WHEN** the user runs JSON > Convert to XML
- **THEN** the result is `<root>` containing `<a>1</a>` and `<b>2</b>`

#### Scenario: Arrays repeat elements
- **GIVEN** `{"l": {"i": ["1", "2"]}}`
- **WHEN** the user runs JSON > Convert to XML
- **THEN** the result has two `<i>` elements inside `<l>`

#### Scenario: Text is escaped
- **GIVEN** `{"a": "1 < 2 & 3"}`
- **WHEN** the user runs JSON > Convert to XML
- **THEN** the text is `1 &lt; 2 &amp; 3`

#### Scenario: Null and booleans
- **GIVEN** `{"r": {"n": null, "t": true}}`
- **WHEN** the user runs JSON > Convert to XML
- **THEN** `n` is an empty element and `t` has the text `true`

#### Scenario: Invalid element name
- **GIVEN** `{"r": {"not valid": 1}}`
- **WHEN** the user runs JSON > Convert to XML
- **THEN** no tab opens and a toast says `r.not valid` is not a valid XML name

#### Scenario: Round trip without mixed content
- **GIVEN** XML with attributes, text and repeated elements but no mixed content, comments or processing instructions
- **WHEN** the user converts it to JSON and the result back to XML
- **THEN** the final XML has the same elements, attributes and text as the original

### Requirement: Notices
After a successful conversion that dropped or changed information (comments, mixed content, converted keys, large integers), the system SHALL show one toast listing what happened, and the new tab SHALL still open.

#### Scenario: Several notices together
- **GIVEN** YAML with a comment and a non-string key
- **WHEN** the user runs YAML > Convert to JSON
- **THEN** one toast mentions both and the new tab opens
