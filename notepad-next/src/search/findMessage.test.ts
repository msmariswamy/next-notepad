import { describe, expect, it } from "vitest";
import { findMessage } from "./findMessage";

describe("findMessage", () => {
  it("says nothing when a match was found without wrapping", () => {
    expect(findMessage("found", false)).toBe("");
    expect(findMessage("found", true)).toBe("");
  });

  it("explains a forward wrap", () => {
    expect(findMessage("wrapped", false)).toBe("Reached end of document, continuing from top");
  });

  it("explains a backward wrap", () => {
    expect(findMessage("wrapped", true)).toBe("Reached start of document, continuing from bottom");
  });

  it("reports the boundary the same way in both directions", () => {
    expect(findMessage("boundary", false)).toBe("No more results");
    expect(findMessage("boundary", true)).toBe("No more results");
  });

  it("keeps 'no results' distinct from 'no more results'", () => {
    expect(findMessage("none", false)).toBe("No results found");
    expect(findMessage("none", false)).not.toBe(findMessage("boundary", false));
  });
});
