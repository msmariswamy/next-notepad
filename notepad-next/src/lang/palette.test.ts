import { describe, expect, it } from "vitest";
import { DARK, LIGHT, contrastRatio, installPalette, paletteCss } from "./palette";

describe("highlight palettes", () => {
  for (const [name, p] of [["light", LIGHT], ["dark", DARK]] as const) {
    it(`${name}: every token colour meets WCAG AA contrast (4.5:1) on the background`, () => {
      for (const [token, colour] of Object.entries(p.tokens)) {
        expect(contrastRatio(colour, p.background), `${name} ${token} ${colour}`).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${name}: plain text contrast is at least 7:1`, () => {
      expect(contrastRatio(p.text, p.background)).toBeGreaterThanOrEqual(7);
    });
  }

  it("light and dark palettes differ", () => {
    expect(LIGHT.tokens.keyword).not.toBe(DARK.tokens.keyword);
  });

  it("generates theme-scoped rules for both themes", () => {
    const css = paletteCss();
    expect(css).toContain(':root[data-theme="dark"] .tok-keyword');
    expect(css).toContain(':root:not([data-theme="dark"]) .tok-keyword');
  });

  it("installs a style element once per call into the document head", () => {
    installPalette(document);
    expect(document.head.querySelector('style[data-palette="tokens"]')).not.toBeNull();
  });
});
