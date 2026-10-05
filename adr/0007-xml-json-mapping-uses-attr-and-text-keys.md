---
status: "accepted"
date: 2026-10-06
decision-makers: mariswamypillai
consulted: none
informed: none
---

# Map XML to JSON with `@attr` and `#text` keys, and back with the same rules

Supersedes: none

## Context and Problem Statement

next-notepad converts between JSON, YAML and XML. JSON and YAML share one data model, but XML has attributes, text mixed with child elements, ordering, comments and namespaces that JSON cannot express. A conversion convention is a contract: users, later changes (XML to YAML, a JSON tree view, any export) and saved files all depend on the same input giving the same output. The convention has to be chosen once and kept stable.

## Decision Drivers

- Output that matches what widely used tools produce, so converted data looks familiar
- A reverse conversion (JSON to XML) that round-trips for ordinary data
- Predictable, documented behavior where information is lost
- No hidden surprises for configuration-style XML (attributes, nested elements, repeated items)

## Considered Options

- `@name` for attributes, `#text` for text, repeated siblings as arrays, root name as the top key
- A strictly lossless form recording element order, mixed content, comments and processing instructions as typed nodes
- Attributes and child elements merged under plain keys without a prefix

## Decision Outcome

Chosen option: "`@name` / `#text` with repeated siblings as arrays and the root name as the top-level key", because it is the common convention, reads naturally, and round-trips configuration-style XML. Specifically:

- an element with only text becomes a string, and an empty element becomes `""`;
- attributes become `@name` keys and element text next to attributes or children becomes `#text`;
- repeated sibling elements become an array, and a single occurrence stays a plain value;
- CDATA and entities become plain text, and namespace prefixes are kept in names (`ns:tag`, `@xmlns:ns`);
- text mixed with child elements is concatenated into `#text` and reported as lossy;
- comments and processing instructions are dropped and reported, because JSON has no place for them.

JSON to XML applies the same rules in reverse. A top-level object with one non-array key is the root, otherwise the result is wrapped in `<root>`.

### Consequences

- Good, because the output matches familiar tools and the reverse direction is a small inverse of the same rules.
- Good, because the lossy cases are narrow and each one tells the user when it happens.
- Bad, because XML with mixed content, comments or processing instructions does not round-trip, and a single occurrence versus a list of one are indistinguishable once converted.
- Bad, because any later change to these rules changes the output of existing workflows, so it needs a new ADR that supersedes this one.

### Confirmation

Confirmed by unit tests for every rule above, a round-trip test over XML without mixed content, comments or processing instructions, and the `format-conversion` spec scenarios.

## Pros and Cons of the Options

### `@name` / `#text`

- Good, because it is familiar and compact.
- Bad, because it is lossy for mixed content.

### Strictly lossless typed nodes

- Good, because nothing is lost.
- Bad, because the JSON is verbose and not what users expect to read or hand-edit.

### Unprefixed attributes and children

- Good, because it is the shortest form.
- Bad, because attributes and child elements with the same name collide.

## More Information

See `openspec/changes/add-xml-yaml-tools/design.md` decision D6 and the `format-conversion` spec.
