## Why

JSON has a full toolset in next-notepad (pretty-print, compress, sort keys, escape, validate, live error marks), but XML and YAML only get the shared Format Document command, and moving data between JSON, YAML and XML means leaving the editor. Configuration work such as Kubernetes manifests and ConfigMaps is mostly YAML and JSON, and XML is still common elsewhere, so the same tools and conversions are needed for them now.

## What Changes

- Add an **XML** menu: Format (2 spaces, 4 spaces, tabs), Compact (removes whitespace between tags; comments, CDATA, processing instructions and text content are untouched), Validate (reports line and column), Sort Attributes (alphabetical, case-sensitive; element order is never changed) and Escape/Unescape (`& < > " '`).
- Add a **YAML** menu: Format (2 or 4 spaces; YAML forbids tab indentation), Compact to flow style (refused with an explanation for multi-document files; a toast warns that comments are dropped), Validate (every document, with line and column) and Sort Keys (every depth, ascending, comments stay attached, list order and anchors/aliases preserved).
- Add live error underlines for XML and YAML tabs, like JSON has: debounced, only for tabs of that language, and skipped above the large-file threshold.
- Add conversions between formats: JSON to YAML, YAML to JSON, XML to JSON and JSON to XML, listed in each format's menu. The result opens in a new untitled tab with its language set; the original is untouched. XML uses `@attr` / `#text` with repeated siblings as arrays, drops comments and processing instructions with a notice, and warns about mixed content; multi-document YAML becomes a JSON array, anchors are expanded, and dropped comments are reported.
- Format reuses the Format Document engines (built-in markup formatter for XML, Prettier for YAML), so the entry points never disagree. Format Document itself is unchanged.
- Selection rules follow JSON: the selection if there is one, otherwise the whole document. An XML selection with several roots is accepted as a fragment; a YAML selection is dedented, processed and re-indented. Invalid input is never modified.
- A plain-text tab switches to XML or YAML after a successful operation; a manual language choice always wins.
- Every command is a plain registry command (`xml.*`, `yaml.*`, `convert.*`). In-place commands are one undo step and recordable in macros; conversions open a tab, so macros do not record them (as for any tab-opening command).
- Add the small `yaml` package, loaded on demand. XML is checked with a small strict XML tokenizer of our own (not `DOMParser`), so line and column are identical in every webview and in unit tests.
- No **BREAKING** changes.

Out of scope: XML to YAML and YAML to XML (they chain through JSON), sorting XML elements, escape/unescape for YAML, and opening files from the command line for `kubectl edit` (planned as its own change, `open-files-from-cli`).

## Capabilities

### New Capabilities
- `xml-tools`: XML menu with format, compact, validate, sort attributes, escape/unescape, and live error underlines.
- `yaml-tools`: YAML menu with format, compact to flow style, validate, sort keys, and live error underlines.
- `format-conversion`: JSON to YAML, YAML to JSON, XML to JSON and JSON to XML, opened in a new tab with documented mapping rules and warnings.

### Modified Capabilities
<!-- None: no existing requirement changes meaning. json-tools and code-formatting are untouched; the new menus and conversions are additive. -->

## Impact

- `notepad-next/src/`: new `xml`, `yaml` and `convert` modules, error-mark extensions, command registry and menu bar, language switching.
- `notepad-next/package.json`: new dependency `yaml` (lazy-loaded).
- Existing code reused: `format/` engines, the JSON tools' selection and result handling, the toast and untitled-tab helpers.
- Tests: Vitest unit tests per module, macOS Playwright e2e for the XML, YAML and conversion menus. No Rust changes.
