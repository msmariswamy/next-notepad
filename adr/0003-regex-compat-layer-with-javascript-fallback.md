---
status: "accepted"
date: 2026-10-05
decision-makers: mariswamypillai
consulted: none
informed: none
---

# Use a regex-compat layer with a JavaScript fallback for Find in Files

Supersedes: none

## Context and Problem Statement

Notepad++ users write PCRE-style patterns and replacements. In-editor search runs in the webview's JavaScript regex engine. Find in Files runs in Rust for speed, and Rust's `regex` crate has different syntax and no lookahead, lookbehind or backreferences. The same pattern must behave the same way in both places, or search results become untrustworthy.

## Decision Drivers

- Identical results for the same pattern in-editor and in Find in Files
- Support for common Notepad++ syntax (`\h`, `\R`, `\x{..}`, `\1`/`$1`, named groups)
- Fast search for large directories
- No heavy new native dependency

## Considered Options

- `regex-compat` translation layer, with a JS-matching fallback for lookaround and backreferences
- JS regex everywhere (Rust only reads files)
- One PCRE2 engine (WASM or Rust binding) everywhere
- Rust `regex` for Find in Files only, flavours left different

## Decision Outcome

Chosen option: "`regex-compat` translation layer with JS fallback", because it keeps Rust speed for ordinary patterns and guarantees JS-reference semantics for patterns that Rust cannot run.

### Consequences

- Good, because plain patterns stay on the fast Rust path.
- Good, because JS regex is the single reference for results.
- Good, because a shared cross-engine test table detects drift.
- Bad, because the translation layer is extra code that must track both engines.
- Bad, because fallback searches transfer file contents across IPC, and are slower.
- Neutral, because PCRE2 stays available as a future replacement if the layer proves leaky.

### Confirmation

Confirmed by a shared test table run through both engines in Vitest and `cargo test`, and by the `find-in-files` spec scenarios for cross-engine consistency.

## Pros and Cons of the Options

### Translation layer with JS fallback

- Good, because it balances speed and consistency.
- Bad, because it is the most code of the practical options.

### JS regex everywhere

- Good, because it is the simplest and always consistent.
- Bad, because Find in Files loses Rust matching speed.

### PCRE2 everywhere

- Good, because it gives full Notepad++ parity.
- Bad, because it adds a native or WASM dependency and build complexity on three OSes.

### Different flavours left as is

- Good, because there is no extra code.
- Bad, because the same pattern gives different results in different places.

## More Information

See `openspec/changes/macos-flutter-notepad/design.md` decisions D6 and D7, and the `find-replace` and `find-in-files` specs.
