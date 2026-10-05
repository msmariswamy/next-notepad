import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, resolveTheme, sanitizeSettings, settingsToCssVars } from "./model";

describe("settings model", () => {
  it("defaults silentClose to off", () => {
    expect(DEFAULT_SETTINGS.silentClose).toBe(false);
  });

  it("clamps font size into a usable range", () => {
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, fontSize: 2 }).fontSize).toBe(8);
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, fontSize: 500 }).fontSize).toBe(72);
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, fontSize: 16.4 }).fontSize).toBe(16);
  });

  it("replaces a NaN font size with the default", () => {
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, fontSize: NaN }).fontSize).toBe(DEFAULT_SETTINGS.fontSize);
  });

  it("replaces a non-positive large-file threshold with the default", () => {
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, largeFileThresholdBytes: 0 }).largeFileThresholdBytes).toBe(
      DEFAULT_SETTINGS.largeFileThresholdBytes,
    );
  });

  it("resolves 'system' theme from the OS preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("maps font settings to CSS variables", () => {
    expect(settingsToCssVars({ ...DEFAULT_SETTINGS, fontSize: 16, fontFamily: "Menlo" })).toEqual({
      "--editor-font-size": "16px",
      "--editor-font-family": "Menlo",
    });
  });
});
