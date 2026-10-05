/** How the macro recorder treats a registry command (spec: macro-recording, "Dialog-opening commands are rejected"). */
export type Recordability =
  /** Becomes a command step. */
  | "record"
  /** Runs, but is not recorded and the user is told so: it opens a dialog or a tab, or changes the layout or settings. */
  | "refuse"
  /** Not recorded as a command because the same action is already recorded another way (Find Next through the Find controller). */
  | "covered";

const REFUSED_PREFIXES = ["file.", "macro.", "view.", "settings.", "help."];

const REFUSED_IDS = new Set(["search.find", "search.replace", "search.findInFiles", "search.findInProjects", "search.mark"]);

const COVERED_IDS = new Set(["search.findNext", "search.findPrev"]);

export function recordability(id: string): Recordability {
  if (COVERED_IDS.has(id)) return "covered";
  if (REFUSED_IDS.has(id) || REFUSED_PREFIXES.some((p) => id.startsWith(p))) return "refuse";
  return "record";
}

/** A macro may only replay what could have been recorded; this also stops a hand-edited macro from starting another macro. */
export function isPlayableCommand(id: string): boolean {
  return id.startsWith("key.") || id.startsWith("find.") || recordability(id) === "record";
}
