---
status: "accepted"
date: 2026-10-06
decision-makers: mariswamypillai
consulted: none
informed: none
---

# Use the `yaml` package with the YAML 1.2 core schema for YAML tools and conversions

Supersedes: none

## Context and Problem Statement

YAML sorting, compacting, validating and conversion need a real parser that reports positions, keeps comments through edits, and expands anchors safely. Prettier already formats YAML, but it exposes no document model for those operations. The YAML version also matters: YAML 1.1 treats `yes`, `no`, `on` and `off` as booleans and reads `0777` as octal, while YAML 1.2 does not, and Kubernetes tooling historically parses YAML 1.1. The choice affects every later feature that reads or writes YAML.

## Decision Drivers

- Positions for errors, and comments preserved through sort and compact
- Safe anchor and alias expansion (limits against alias bombs)
- A small, dependency-free library loaded only on demand
- Agreement with Prettier's YAML formatting and common editors

## Considered Options

- The `yaml` package (YAML 1.2 core schema by default), lazily imported
- `js-yaml` (YAML 1.2-ish, no comment model)
- Prettier's YAML plugin only (no document model)
- Writing our own YAML parser

## Decision Outcome

Chosen option: "the `yaml` package with the 1.2 core schema, imported on first use", because it is the only small option that gives error positions, a comment-preserving `Document`, sorting and flow-style output, and an alias-count limit. Format still uses Prettier so that Format Document and the YAML menu agree. Scalars that YAML 1.1 would read as booleans or octals (`yes`, `on`, `0777`) stay strings or plain numbers, and the YAML to JSON notice says when such a value is present.

### Consequences

- Good, because validation, sort, compact and conversion share one parser with positions and comments.
- Good, because the library is lazy-loaded and adds nothing to start-up.
- Bad, because values that Kubernetes would read as YAML 1.1 booleans convert differently, so a YAML 1.1 mode may be needed later (recorded in the design's open questions).
- Bad, because the `yaml` package restyles some formatting (sequence indentation, quoting) when it prints a Document, which is acceptable only for the explicit Sort and Compact rewrites.

### Confirmation

Confirmed by unit tests for comment, anchor and key-order preservation, alias-limit refusal, duplicate-key errors, and the `yaml-tools` and `format-conversion` spec scenarios. A change to a different YAML version or library needs a new ADR that supersedes this one.

## Pros and Cons of the Options

### The `yaml` package

- Good, because it covers every needed operation with positions and comments.
- Bad, because its printer may restyle some formatting.

### `js-yaml`

- Good, because it is widely used.
- Bad, because it drops comments and gives weaker error positions.

### Prettier's YAML plugin only

- Good, because it is already a dependency.
- Bad, because it has no document model for sorting, flow style or conversion.

### Our own parser

- Good, because it would be fully controlled.
- Bad, because YAML is large and subtle, and the cost is far beyond the benefit.

## More Information

See `openspec/changes/add-xml-yaml-tools/design.md` decisions D4 and D6, and ADR-0007.
