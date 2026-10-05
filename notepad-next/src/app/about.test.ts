import { afterEach, describe, expect, it } from "vitest";
import pkg from "../../package.json";
import { openAboutDialog } from "./about";
import { APP_INFO } from "./appInfo";

afterEach(() => (document.body.innerHTML = ""));

describe("About", () => {
  it("credits the author and shows the version from package.json", () => {
    expect(APP_INFO.version).toBe(pkg.version);
    expect(APP_INFO.author).toBe("Mariswamy Pillai");
    const d = openAboutDialog();
    expect(d.textContent).toContain("next-notepad");
    expect(d.textContent).toContain(`Version ${pkg.version}`);
    expect(d.textContent).toContain("Idea and creation by Mariswamy Pillai");
    expect(d.textContent).toContain("© 2026 Mariswamy Pillai");
  });

  it("closes and removes itself with the Close button", () => {
    const d = openAboutDialog();
    (d.querySelector("button") as HTMLElement).click();
    expect(document.querySelector('[data-testid="about-dialog"]')).toBeNull();
  });

  it("keeps package metadata in sync with the credit", () => {
    expect((pkg as { author?: string }).author).toBe(APP_INFO.author);
  });
});
