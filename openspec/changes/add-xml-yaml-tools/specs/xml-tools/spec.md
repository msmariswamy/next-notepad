## ADDED Requirements

### Requirement: XML menu
The system SHALL provide an XML menu with Format (2 spaces, 4 spaces, tabs), Compact, Validate, Sort Attributes, Escape and Unescape. Each command SHALL act on the selection, or on the whole document when nothing is selected, and SHALL be one undo step.

#### Scenario: Whole document when nothing is selected
- **GIVEN** an XML document and no selection
- **WHEN** the user runs XML > Compact
- **THEN** the whole document is compacted

#### Scenario: Selection only
- **GIVEN** a document with a selected fragment `<a> <b/> </a>`
- **WHEN** the user runs XML > Compact
- **THEN** only the selected text changes

#### Scenario: One undo step
- **GIVEN** the user ran XML > Sort Attributes
- **WHEN** the user presses Undo once
- **THEN** the document returns to its text before the command

### Requirement: Format XML
The system SHALL format XML with the same formatter as Format Document, using the chosen indent of 2 spaces, 4 spaces or a tab.

#### Scenario: Two-space indent
- **GIVEN** the text `<a><b>x</b></a>`
- **WHEN** the user runs XML > Format (2 spaces)
- **THEN** `<b>` is on its own line indented by 2 spaces inside `<a>`

#### Scenario: Tab indent
- **GIVEN** the text `<a><b>x</b></a>`
- **WHEN** the user runs XML > Format (tabs)
- **THEN** `<b>` is indented by one tab

#### Scenario: Same result as Format Document
- **GIVEN** an XML tab with tab width 2
- **WHEN** the user runs XML > Format (2 spaces), undoes, then runs Format Document
- **THEN** both produce the same text

### Requirement: Compact XML
The system SHALL remove whitespace-only text between tags, comments and processing instructions, including indentation and line breaks. It SHALL NOT change comments, CDATA, processing instructions, or any text that is not only whitespace, and SHALL leave the content of elements under `xml:space="preserve"` unchanged.

#### Scenario: Indentation removed
- **GIVEN** `<a>\n  <b>x</b>\n  <c/>\n</a>`
- **WHEN** the user runs XML > Compact
- **THEN** the text is `<a><b>x</b><c/></a>`

#### Scenario: Text content is kept exactly
- **GIVEN** `<a>  hello  <b/> world </a>`
- **WHEN** the user runs XML > Compact
- **THEN** the text `  hello  ` and ` world ` is unchanged

#### Scenario: Comments and CDATA are kept
- **GIVEN** a document with `<!-- note -->` and `<![CDATA[ <x> ]]>`
- **WHEN** the user runs XML > Compact
- **THEN** both appear unchanged in the result

#### Scenario: Preserved whitespace
- **GIVEN** `<a xml:space="preserve">\n  <b/>\n</a>`
- **WHEN** the user runs XML > Compact
- **THEN** the whitespace inside `<a>` is unchanged

### Requirement: Validate XML
The system SHALL check that the text is well-formed XML and report the first error with its line and column, or report that the XML is valid. Checks SHALL include mismatched or unclosed tags, unquoted attribute values, duplicate attributes on one element, a bare `&`, unknown entity names, and text or several root elements outside the root. A selection MAY contain several root elements.

#### Scenario: Valid XML
- **GIVEN** `<a x="1"><b/></a>`
- **WHEN** the user runs XML > Validate
- **THEN** a toast says the XML is valid

#### Scenario: Mismatched tag
- **GIVEN** `<a>\n<b></a>`
- **WHEN** the user runs XML > Validate
- **THEN** a toast reports an error on line 2 and the caret moves there

#### Scenario: Duplicate attribute
- **GIVEN** `<a x="1" x="2"/>`
- **WHEN** the user runs XML > Validate
- **THEN** a toast reports a duplicate attribute with its line and column

#### Scenario: Bare ampersand
- **GIVEN** `<a>fish & chips</a>`
- **WHEN** the user runs XML > Validate
- **THEN** a toast reports an invalid `&` with its position

#### Scenario: Several roots in a selection
- **GIVEN** a selection `<a/><b/>`
- **WHEN** the user runs XML > Validate
- **THEN** a toast says the XML is valid

#### Scenario: Several roots in a whole document
- **GIVEN** a document `<a/><b/>` with nothing selected
- **WHEN** the user runs XML > Validate
- **THEN** a toast reports that only one root element is allowed

### Requirement: Invalid XML is never modified
If the text is not well-formed, Format, Compact, Sort Attributes and conversions SHALL leave the document unchanged and show the error with its line and column.

#### Scenario: Compact on invalid XML
- **GIVEN** `<a><b></a>`
- **WHEN** the user runs XML > Compact
- **THEN** the text is unchanged and a toast reports the error position

### Requirement: Sort attributes
The system SHALL reorder the attributes of every element alphabetically by name (ordinal, case-sensitive), keeping each attribute's text and quoting, and SHALL NOT change the order of elements.

#### Scenario: Attributes sorted
- **GIVEN** `<a z="1" b='2' a="3"/>`
- **WHEN** the user runs XML > Sort Attributes
- **THEN** the text is `<a a="3" b='2' z="1"/>`

#### Scenario: Elements keep their order
- **GIVEN** `<r><z b="1" a="2"/><a/></r>`
- **WHEN** the user runs XML > Sort Attributes
- **THEN** `<z>` is still before `<a>` and only the attributes of `<z>` are reordered

#### Scenario: Namespace declarations
- **GIVEN** `<a xmlns:x="u" id="1"/>`
- **WHEN** the user runs XML > Sort Attributes
- **THEN** `id` comes before `xmlns:x`

### Requirement: Escape and unescape XML text
The system SHALL escape `&`, `<`, `>`, `"` and `'` as `&amp;`, `&lt;`, `&gt;`, `&quot;` and `&apos;`, and Unescape SHALL reverse one level of those five entities and of numeric references (`&#65;`, `&#x41;`), leaving unknown entities as written.

#### Scenario: Escape
- **GIVEN** the selection `a < b && "c"`
- **WHEN** the user runs XML > Escape
- **THEN** the selection becomes `a &lt; b &amp;&amp; &quot;c&quot;`

#### Scenario: Unescape
- **GIVEN** the selection `&lt;a&gt; &#65; &#x42; &unknown;`
- **WHEN** the user runs XML > Unescape
- **THEN** the selection becomes `<a> A B &unknown;`

#### Scenario: Round trip
- **GIVEN** any text
- **WHEN** the user runs Escape and then Unescape
- **THEN** the text is the original

### Requirement: Live XML error underline
The system SHALL underline the first well-formedness error in a tab whose language is XML after the user pauses typing, and SHALL NOT underline anything in tabs of other languages, in empty text, or in documents longer than 1,000,000 characters.

#### Scenario: Error is underlined
- **GIVEN** an XML tab
- **WHEN** the user types `<a><b></a>` and pauses
- **THEN** the error position is underlined

#### Scenario: Mark disappears when fixed
- **GIVEN** an underlined error
- **WHEN** the user fixes the XML and pauses
- **THEN** the underline is removed

#### Scenario: Other languages show no XML marks
- **GIVEN** a Python tab containing `<a><b></a>`
- **WHEN** the user pauses typing
- **THEN** nothing is underlined

### Requirement: Language switch
After a successful XML command on a tab whose language is Normal text, or on an untitled tab whose language was only detected from its content, the system SHALL set the tab's language to XML unless the user had chosen a language manually. A tab that belongs to a file SHALL keep the language its file name gave it.

#### Scenario: Plain text becomes XML
- **GIVEN** a Normal text tab containing `<a><b/></a>`
- **WHEN** the user runs XML > Format (2 spaces)
- **THEN** the tab's language is XML

#### Scenario: A guessed language is replaced
- **GIVEN** an untitled tab whose language was detected automatically as HTML
- **WHEN** the user runs a XML command that succeeds
- **THEN** the tab's language is XML

#### Scenario: A file keeps its language
- **GIVEN** a tab for `page.html` whose language is HTML
- **WHEN** the user runs a XML command that succeeds
- **THEN** the tab's language stays HTML

#### Scenario: Manual choice wins
- **GIVEN** a tab whose language the user set to Python
- **WHEN** the user runs XML > Format (2 spaces)
- **THEN** the tab's language stays Python
