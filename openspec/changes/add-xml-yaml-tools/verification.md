# Verification (task 8.2)

Every requirement in `specs/` has automated coverage: Vitest (`npm test`), `cargo test` (no Rust changes here), and WebKit
end-to-end (`npm run test:e2e`). This file lists what those suites cannot show, the places where the implementation
differs from the specs on purpose, and the manual checks to run in the real app (`npm run tauri dev`).

## Not covered by an automated test

- **Windows (WebView2):** the new UI has unit tests and CI, but there is no Windows end-to-end run (ADR-0004 keeps e2e macOS-only).
  The XML checks do not depend on the webview (own tokenizer), and the YAML tools run in plain JavaScript, so differences are unlikely.
- **YAML 1.1 values in Kubernetes files:** the `yaml` package reads YAML 1.2, so `yes`, `no`, `on`, `off` stay strings and
  `0777` is a decimal number, where Kubernetes tooling (YAML 1.1) would read booleans and an octal. No notice is shown yet.
- **Mixed-content XML** is flattened by XML to JSON (with a notice) and does not round-trip.
- **Extremely large inputs:** conversions and tools run on the main thread; only the live underline has a size limit (1,000,000 characters).

## Spec deviations (intentional)

- The `yaml-tools` scenario "Anchors and aliases are preserved" used an alias before its anchor, which is not valid YAML.
  The spec now uses an anchor-first input and adds a scenario for a sort that would move an alias before its anchor (refused).
- The `yaml` package does not sort maps it has parsed, so sorting is done by this change's code while walking the document;
  comments and blank lines hang on the key node and move with their pair (covered by tests).
- A YAML selection that starts after the indent of its first line (for example after pressing Home once) is not valid YAML on
  its own and is refused with an error; select from the true start of the line.
- Columns reported for errors inside a selection are mapped back to the document's line and column.

## Manual checklist (real app, before each release)

- [ ] **Real ConfigMap:** paste the output of `kubectl get cm <name> -o yaml` into a tab. Run YAML > Validate, Format, Sort Keys and
  Compact; YAML > Convert to JSON and check the result against `kubectl get cm <name> -o json`.
- [ ] **A large XML config** (a few MB): XML > Format, Compact and Sort Attributes complete without freezing; the live underline
  switches off above 1,000,000 characters.
- [ ] **Namespaces:** convert an XML file that uses prefixes (an Android manifest or a Maven `pom.xml`) to JSON and back; the
  prefixes and `xmlns` attributes are kept.
- [ ] **Clipboard round trip:** copy JSON from another app, convert to YAML and paste the result into a Kubernetes manifest.
