import { describe, expect, it } from "vitest";
import { DEFAULT_LARGE_FILE_BYTES, exceedsLargeFileLimit } from "./limits";

describe("large file limit", () => {
  it("defaults to 50 MB", () => {
    expect(DEFAULT_LARGE_FILE_BYTES).toBe(50 * 1024 * 1024);
  });

  it("does not warn at exactly the threshold", () => {
    expect(exceedsLargeFileLimit(100, 100)).toBe(false);
  });

  it("warns above the threshold", () => {
    expect(exceedsLargeFileLimit(101, 100)).toBe(true);
  });

  it("uses the default threshold when none is given", () => {
    expect(exceedsLargeFileLimit(DEFAULT_LARGE_FILE_BYTES + 1)).toBe(true);
    expect(exceedsLargeFileLimit(1024)).toBe(false);
  });
});
