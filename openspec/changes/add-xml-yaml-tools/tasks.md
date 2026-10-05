## 1. Shared tool runner and menu plumbing (design D1, D8, D9)

- [ ] 1.1 Add the `yaml` dependency to `notepad-next/package.json` and confirm `npm run build` still succeeds with it imported lazily
- [ ] 1.2 Write tests for `src/tools/runTool.ts` (selection vs whole document, one undo step, stale-document abort, error caret on whole-document errors only, toast text, language switch for Normal text tabs and not for manual choices), then implement it
- [ ] 1.3 Write tests for the convert runner (opens a new untitled tab with the text and a manual language, leaves the source tab unchanged, shows one toast for warnings, opens no tab on error), then implement it
- [ ] 1.4 Add the `convert.` prefix to the refused list in `src/macro/recordable.ts`, with a test that a Convert command runs but is not recorded and shows the toast

## 2. XML tokenizer and validation (spec: xml-tools; design D2)

- [ ] 2.1 Write table-driven tests for `src/xml/tokens.ts` (valid and invalid documents: mismatched and unclosed tags, unquoted attributes, duplicate attributes, bare `&`, unknown entities, text before the root, several roots, comments, CDATA, processing instructions, doctype) with line and column, then implement the strict tokenizer
- [ ] 2.2 Write tests for `validateXml` (whole document needs one root, selection fragments may have several), then implement it on the token stream
- [ ] 2.3 Write tests for the live-underline range (first error, end-of-text error, empty and over-1,000,000-character text give none), then implement `xmlErrorRange`

## 3. XML tools (spec: xml-tools; design D3)

- [ ] 3.1 Write tests for Compact (indentation and line breaks removed; non-blank text, comments, CDATA and processing instructions untouched; `xml:space="preserve"` honored; invalid input refused), then implement it on the token stream
- [ ] 3.2 Write tests for Sort Attributes (ordinal order, original quoting kept, element order unchanged, namespace declarations sorted with the rest, self-closing tags), then implement it
- [ ] 3.3 Write tests for Escape and Unescape (the five characters, numeric references, unknown entities untouched, round trip), then implement them
- [ ] 3.4 Write tests that Format uses the same engine as Format Document with 2 spaces, 4 spaces and tabs and validates first, then implement `formatXml`
- [ ] 3.5 Register `xml.format2`, `xml.format4`, `xml.formatTabs`, `xml.compact`, `xml.sortAttributes`, `xml.escape`, `xml.unescape`, `xml.validate` and the XML menu, with registry tests (ids exist, menu lists them, no accelerators)

## 4. Live error underlines (spec: xml-tools, yaml-tools; design D7)

- [ ] 4.1 Write tests for the generalized `languageErrorMarks` (debounce, mark follows edits until the next validation, cleared when valid, view destroyed meanwhile, async validators), then implement `src/editor/syntaxErrors.ts` leaving `jsonErrors.ts` unchanged
- [ ] 4.2 Attach the XML marks in the XML language loader and the YAML marks in the YAML loader in `src/lang/languages.ts`, with tests that other languages get none, and add the CSS for the underline classes

## 5. YAML tools (spec: yaml-tools; design D4, D5)

- [ ] 5.1 Write tests for `validateYaml` (every document checked, first error's line and column, error in a later document, duplicate keys), then implement it with `parseAllDocuments`
- [ ] 5.2 Write tests for Sort Keys (every depth, ascending, comments stay with keys, list order kept, anchors and aliases preserved, invalid input untouched), then implement it
- [ ] 5.3 Write tests for Compact to flow style (one line, no wrapping, comments dropped with a notice, anchors and aliases kept, several documents refused), then implement it
- [ ] 5.4 Write tests for the YAML selection wrapper (dedent by common indent, process, re-indent non-blank lines, unparsable selection left untouched), then implement it
- [ ] 5.5 Write tests that YAML Format uses Prettier with 2 or 4 spaces and keeps comments, then implement `formatYaml`
- [ ] 5.6 Register `yaml.format2`, `yaml.format4`, `yaml.compact`, `yaml.validate`, `yaml.sortKeys` and the YAML menu, with registry tests (no tab option, no accelerators)

## 6. Conversions (spec: format-conversion; design D6; ADR-0007, ADR-0008)

- [ ] 6.1 Write tests for JSON to YAML (nesting, key order, large integers keep their digits, strings that look like other types are quoted, invalid JSON reports its position), then implement it
- [ ] 6.2 Write tests for YAML to JSON (single and several documents, aliases expanded, alias-limit refusal, comments dropped with a notice, non-string keys with a warning, `.nan` and `.inf` refused with the key path, large integer warning), then implement it
- [ ] 6.3 Write tests for XML to JSON (attributes, text, repeated elements as arrays, empty element, CDATA and entities, namespace prefixes, selection with several roots, mixed content flattened with a warning, comments and processing instructions dropped with a notice), then implement it
- [ ] 6.4 Write tests for JSON to XML (single key is the root, otherwise `<root>`, `@name` attributes, `#text`, arrays repeat elements, `null` and booleans, escaped text, invalid element names named by path, 2-space output), then implement it
- [ ] 6.5 Write a round-trip test over XML without mixed content, comments or processing instructions (XML to JSON to XML keeps elements, attributes and text)
- [ ] 6.6 Register `convert.jsonToYaml`, `convert.jsonToXml`, `convert.yamlToJson`, `convert.xmlToJson` and add them to the JSON, YAML and XML menus, with registry tests

## 7. End-to-end flows (ADR-0004: Playwright WebKit on macOS)

- [ ] 7.1 Add an XML e2e flow: format, compact, sort attributes, escape then unescape, validate a broken document and see the caret move, the live underline appears and clears
- [ ] 7.2 Add a YAML e2e flow: format, sort keys, compact with the comment notice, validate a broken document, the live underline, a multi-document Compact refusal
- [ ] 7.3 Add a conversion e2e flow: each of the four conversions opens a new tab with the right language and leaves the source tab unchanged, an invalid source opens no tab, a notice toast appears for dropped comments

## 8. Verification and wrap-up

- [ ] 8.1 Run `npm run typecheck`, `npm test`, `cargo test` and `npm run test:e2e` and confirm all pass
- [ ] 8.2 Write `verification.md` for this change: the known gaps (for example YAML 1.1 values in Kubernetes files, mixed-content XML, the exact flow-style spacing of the `yaml` package) and a manual checklist (try a real Kubernetes ConfigMap and a real XML config on macOS and Windows)
- [ ] 8.3 Update the READMEs (feature list and menus) for the XML and YAML menus and the conversions
- [ ] 8.4 Run `openspec validate add-xml-yaml-tools --type change --strict` before archive
