import type { DocResults, SearchOutcome } from "./findController";
import type { ResultLine } from "./resultLines";

/** Bottom results panel listing hits grouped by document; a click jumps to the match. */
export function renderResults(
  el: HTMLElement,
  outcome: SearchOutcome,
  onSelect: (doc: DocResults, hit: ResultLine) => void,
  onClose: () => void,
): void {
  el.hidden = false;
  const header = document.createElement("div");
  header.className = "results-header";
  const summary = document.createElement("span");
  summary.className = "results-summary";
  summary.textContent = outcome.summary;
  const close = document.createElement("button");
  close.textContent = "×";
  close.setAttribute("aria-label", "Close results");
  close.addEventListener("click", onClose);
  header.append(summary, close);

  const body = document.createElement("div");
  body.className = "results-body";
  for (const doc of outcome.results) {
    const title = document.createElement("div");
    title.className = "results-doc";
    title.textContent = `${doc.title} (${doc.hits.length} hit${doc.hits.length === 1 ? "" : "s"})`;
    body.append(title);
    for (const hit of doc.hits) {
      const row = document.createElement("div");
      row.className = "results-hit";
      row.textContent = `Line ${hit.line}: ${hit.text}`;
      row.addEventListener("click", () => onSelect(doc, hit));
      body.append(row);
    }
  }
  el.replaceChildren(header, body);
}
