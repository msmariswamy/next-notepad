/** What a Find Next / Find Previous did: selected a match, wrapped past the document edge to one, stopped at the edge, or found nothing at all. */
export type FindOutcome = "found" | "wrapped" | "boundary" | "none";

/** One wording for the dialog status line and the shortcut toast; empty when there is nothing to tell the user. */
export function findMessage(outcome: FindOutcome, backward: boolean): string {
  switch (outcome) {
    case "wrapped":
      return backward ? "Reached start of document, continuing from bottom" : "Reached end of document, continuing from top";
    case "boundary":
      return "No more results";
    case "none":
      return "No results found";
    default:
      return "";
  }
}
