import { defineConfig, devices } from "@playwright/test";

// macOS-only for now: tauri-driver has no macOS support, so UI flows run in
// Playwright's WebKit (same engine family as Tauri's WKWebView) against the Vite
// dev server, with the Tauri IPC layer mocked in the page. Linux/Windows
// coverage (tauri-driver + WebdriverIO) is deferred to a follow-up.
export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:1420" },
  projects: [{ name: "webkit", use: { ...devices["Desktop Safari"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: true,
  },
});
