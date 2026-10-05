import { beforeEach, describe, expect, it } from "vitest";
import { SearchHistory } from "./history";

beforeEach(() => localStorage.clear());

describe("SearchHistory", () => {
  it("lists most recent first", () => {
    const h = new SearchHistory("k");
    h.add("a");
    h.add("b");
    expect(h.list()).toEqual(["b", "a"]);
  });

  it("moves a repeated term to the front without duplicating it", () => {
    const h = new SearchHistory("k");
    h.add("a");
    h.add("b");
    h.add("a");
    expect(h.list()).toEqual(["a", "b"]);
  });

  it("ignores empty terms", () => {
    const h = new SearchHistory("k");
    h.add("");
    expect(h.list()).toEqual([]);
  });

  it("keeps at most 20 entries", () => {
    const h = new SearchHistory("k");
    for (let i = 0; i < 30; i++) h.add(`t${i}`);
    expect(h.list().length).toBe(20);
    expect(h.list()[0]).toBe("t29");
  });

  it("persists across instances (restarts)", () => {
    new SearchHistory("k").add("foo");
    expect(new SearchHistory("k").list()).toEqual(["foo"]);
  });

  it("survives corrupt stored data", () => {
    localStorage.setItem("k", "{not json");
    expect(new SearchHistory("k").list()).toEqual([]);
  });

  it("keeps separate lists per key", () => {
    new SearchHistory("find").add("x");
    expect(new SearchHistory("replace").list()).toEqual([]);
  });
});
