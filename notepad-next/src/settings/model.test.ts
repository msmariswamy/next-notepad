import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, resolveTheme, sanitizeSettings, settingsToCssVars } from "./model";

describe("settings model", () => {
  it("defaults silentClose to off", () => {
    expect(DEFAULT_SETTINGS.silentClose).toBe(false);
  });

  it("hides both side panels by default", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ showFunctionList: false, showDocumentMap: false });
  });

  it("an older settings object without the panel keys falls back to hidden once merged over the defaults", () => {
    const { showFunctionList, showDocumentMap, ...older } = { ...DEFAULT_SETTINGS, wordWrap: true };
    void showFunctionList;
    void showDocumentMap;
    const merged = sanitizeSettings({ ...DEFAULT_SETTINGS, ...older });
    expect(merged).toMatchObject({ wordWrap: true, showFunctionList: false, showDocumentMap: false });
  });

  it("clamps font size into a usable range", () => {
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, fontSize: 2 }).fontSize).toBe(8);
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, fontSize: 500 }).fontSize).toBe(72);
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, fontSize: 16.4 }).fontSize).toBe(16);
  });

  it("clamps tab width to 1-16 and defaults to 4 spaces", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ tabWidth: 4, useTabs: false, showAllCharacters: false });
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, tabWidth: 0 }).tabWidth).toBe(1);
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, tabWidth: 99 }).tabWidth).toBe(16);
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, tabWidth: NaN }).tabWidth).toBe(4);
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
