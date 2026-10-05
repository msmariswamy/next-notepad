import { describe, expect, it, vi } from "vitest";
import { renderResults } from "./resultsPanel";

const outcome = {
  summary: 'Search "a" (2 hits in 1 file)',
  results: [
    {
      docId: "doc-1",
      title: "new 1",
      hits: [
        { line: 1, text: "a one", from: 0, to: 1 },
        { line: 3, text: "a three", from: 10, to: 11 },
      ],
    },
  ],
};

describe("results panel", () => {
  it("shows the summary, the document and each hit with its line number", () => {
    const el = document.createElement("div");
    renderResults(el, outcome, vi.fn(), vi.fn());
    expect(el.hidden).toBe(false);
    expect(el.querySelector(".results-summary")!.textContent).toBe('Search "a" (2 hits in 1 file)');
    expect(el.querySelector(".results-doc")!.textContent).toBe("new 1 (2 hits)");
    expect([...el.querySelectorAll(".results-hit")].map((r) => r.textContent)).toEqual(["Line 1: a one", "Line 3: a three"]);
  });

  it("navigates to the match when a hit is clicked", () => {
    const el = document.createElement("div");
    const onSelect = vi.fn();
    renderResults(el, outcome, onSelect, vi.fn());
    (el.querySelectorAll(".results-hit")[1] as HTMLElement).click();
    expect(onSelect).toHaveBeenCalledWith(outcome.results[0], outcome.results[0].hits[1]);
  });

  it("calls onClose from the close button", () => {
    const el = document.createElement("div");
    const onClose = vi.fn();
    renderResults(el, outcome, vi.fn(), onClose);
    (el.querySelector("button") as HTMLElement).click();
    expect(onClose).toHaveBeenCalled();
  });
});
