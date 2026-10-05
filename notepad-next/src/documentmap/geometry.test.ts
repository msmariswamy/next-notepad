import { describe, expect, it } from "vitest";
import { MAX_MAP_LINES, contentHeight, isMapDisabled, lineRow, rowCount, scrollTopForMapY, viewportRect } from "./geometry";

describe("isMapDisabled", () => {
  const threshold = 50 * 1024 * 1024;
  it("is enabled for a normal document", () => {
    expect(isMapDisabled(10_000, 400_000, threshold)).toBe(false);
  });
  it("is disabled above 50,000 lines", () => {
    expect(MAX_MAP_LINES).toBe(50_000);
    expect(isMapDisabled(50_000, 100, threshold)).toBe(false);
    expect(isMapDisabled(50_001, 100, threshold)).toBe(true);
  });
  it("is disabled above the large-file threshold", () => {
    expect(isMapDisabled(10, 2_000, 1_000)).toBe(true);
    expect(isMapDisabled(10, 1_000, 1_000)).toBe(false);
  });
});

describe("rows", () => {
  it("uses 2px per line while the whole document fits", () => {
    expect(rowCount(100, 400)).toBe(100);
    expect(contentHeight(100, 400)).toBe(200);
  });
  it("compresses long documents into the available height", () => {
    expect(rowCount(10_000, 400)).toBe(200);
    expect(contentHeight(10_000, 400)).toBe(400);
  });
  it("maps lines onto rows in order, the first line to row 0 and the last to the last row", () => {
    expect(lineRow(0, 10_000, 400)).toBe(0);
    expect(lineRow(9_999, 10_000, 400)).toBe(199);
    expect(lineRow(5_000, 10_000, 400)).toBe(100);
  });
  it("an empty or one-line document still has a row", () => {
    expect(rowCount(1, 400)).toBe(1);
    expect(rowCount(0, 400)).toBe(1);
  });
});

describe("viewportRect", () => {
  it("covers the whole map when everything is visible", () => {
    expect(viewportRect({ scrollTop: 0, clientHeight: 500, scrollHeight: 500 }, 200)).toEqual({ top: 0, height: 200 });
  });
  it("is proportional to the visible part and moves with scrolling", () => {
    expect(viewportRect({ scrollTop: 0, clientHeight: 500, scrollHeight: 2000 }, 400)).toEqual({ top: 0, height: 100 });
    expect(viewportRect({ scrollTop: 750, clientHeight: 500, scrollHeight: 2000 }, 400)).toEqual({ top: 150, height: 100 });
  });
  it("never leaves the map", () => {
    const r = viewportRect({ scrollTop: 1500, clientHeight: 500, scrollHeight: 2000 }, 400);
    expect(r.top + r.height).toBeLessThanOrEqual(400);
  });
  it("handles an unmeasured editor", () => {
    expect(viewportRect({ scrollTop: 0, clientHeight: 0, scrollHeight: 0 }, 400)).toEqual({ top: 0, height: 400 });
  });
});

describe("scrollTopForMapY", () => {
  const m = { clientHeight: 500, scrollHeight: 2000 };
  it("centres the visible part on the pointer", () => {
    expect(scrollTopForMapY(200, 400, m)).toBe(750);
  });
  it("clamps at the top and the bottom", () => {
    expect(scrollTopForMapY(0, 400, m)).toBe(0);
    expect(scrollTopForMapY(400, 400, m)).toBe(1500);
    expect(scrollTopForMapY(-50, 400, m)).toBe(0);
    expect(scrollTopForMapY(9_999, 400, m)).toBe(1500);
  });
  it("does nothing when the document fits", () => {
    expect(scrollTopForMapY(100, 400, { clientHeight: 500, scrollHeight: 500 })).toBe(0);
  });
});
