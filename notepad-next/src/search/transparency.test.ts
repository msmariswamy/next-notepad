import { describe, expect, it } from "vitest";
import { dialogOpacity } from "./transparency";

const on = { enabled: true, mode: "blur" as const, level: 50 };

describe("dialogOpacity", () => {
  it("is opaque when transparency is off", () => {
    expect(dialogOpacity({ ...on, enabled: false }, false)).toBe(1);
  });
  it("is translucent only while unfocused in 'on losing focus' mode", () => {
    expect(dialogOpacity(on, true)).toBe(1);
    expect(dialogOpacity(on, false)).toBe(0.5);
  });
  it("is always translucent in 'always' mode", () => {
    expect(dialogOpacity({ ...on, mode: "always" }, true)).toBe(0.5);
  });
  it("never goes below 20% so the dialog cannot disappear", () => {
    expect(dialogOpacity({ ...on, level: 0 }, false)).toBe(0.2);
  });
});
