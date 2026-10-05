---
status: "accepted"
date: 2026-10-05
decision-makers: mariswamypillai
consulted: none
informed: none
---

# Run end-to-end tests in Playwright WebKit on macOS, with CI on macOS only for now

Supersedes: none (amends the "Confirmation" section of ADR-0001, which stays unchanged as the historical record)

## Context and Problem Statement

ADR-0001 chose Tauri 2 and confirmed it would be validated by CI building and running the unit and end-to-end suites on macOS, Windows and Linux, with WebdriverIO and `tauri-driver` for end-to-end tests. During implementation two facts changed that plan: `tauri-driver` has no macOS desktop support, and the project is developed on macOS first with Windows and Linux testing deliberately postponed by the owner. We need an end-to-end approach that works on macOS today without blocking development.

## Decision Drivers

- End-to-end coverage on macOS now, since that is the development platform
- Tests that run quickly and deterministically in CI
- Same web engine family as the shipped macOS webview (WKWebView)
- A path to the real Tauri shell later

## Considered Options

- Playwright (WebKit) against the Vite dev server with an in-memory host replacing Tauri IPC
- A community macOS WebDriver bridge for the real app
- WebdriverIO with `tauri-driver` on Linux and Windows only
- No end-to-end tests

## Decision Outcome

Chosen option: "Playwright (WebKit) with an in-memory host", because it runs on macOS, exercises the real UI code in the engine closest to production, and stays fast. CI runs on macOS only for now; Windows and Linux are added later together with `tauri-driver` tests of the real shell.

### Consequences

- Good, because 133 UI flows run in a few seconds and catch layout, focus and keyboard regressions.
- Good, because the same host also powers `npm run dev` for browser-only development.
- Bad, because the real shell is not covered by automation: native dialogs, clipboard permission, IPC channel streaming for Find in Files and the window close flow rely on Rust unit tests and a manual checklist (`verification.md`).
- Bad, because Windows and Linux builds are unverified until their CI jobs exist.

### Confirmation

Confirmed by `npm run test:e2e` passing in CI on macOS, and by the manual checklist in `openspec/changes/macos-flutter-notepad/verification.md` being run before each release. This ADR is revisited when Windows and Linux support starts.

## Pros and Cons of the Options

### Playwright (WebKit) with an in-memory host

- Good, because it works today on macOS and is deterministic.
- Bad, because it does not drive the real Tauri shell.

### Community macOS WebDriver bridge

- Good, because it would drive the real app.
- Bad, because it is unofficial, fragile, and adds a dependency.

### WebdriverIO with `tauri-driver` on Linux and Windows only

- Good, because it tests the real shell and is the supported route.
- Bad, because it gives no end-to-end coverage on the development platform.

### No end-to-end tests

- Bad, because UI regressions (focus, menus, dialogs) would go unnoticed.

## More Information

See `design.md` decision D11 and `adr/0001-use-tauri-2-and-codemirror-6-for-notepad-next.md`.
