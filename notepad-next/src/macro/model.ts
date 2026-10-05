/** Persisted macro format (spec: macro-recording, ADR-0006). Bump the version when a step's meaning changes. */
export const MACRO_FILE_VERSION = 1;

/**
 * Typing or deleting around the main selection: `before`/`after` characters are removed on each side of the
 * selection (which is itself replaced) and `insert` is typed in its place. Relative, so it replays anywhere.
 */
export interface TextStep {
  type: "text";
  insert: string;
  before: number;
  after: number;
}

/** A registry command by its stable id (menu actions, Find/Replace actions as `find.*` with their options in args). */
export interface CommandStep {
  type: "command";
  id: string;
  args?: Record<string, unknown>;
}

export type MacroStep = TextStep | CommandStep;

export interface Macro {
  name: string;
  shortcut?: string;
  steps: MacroStep[];
}

export interface MacroFile {
  version: typeof MACRO_FILE_VERSION;
  macros: Macro[];
}

export const emptyMacroFile = (): MacroFile => ({ version: MACRO_FILE_VERSION, macros: [] });

export const serializeMacroFile = (file: MacroFile): string => JSON.stringify(file, null, 2);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

function parseStep(raw: unknown): MacroStep | null {
  if (!isObject(raw)) return null;
  if (raw.type === "text") {
    return typeof raw.insert === "string" && isCount(raw.before) && isCount(raw.after)
      ? { type: "text", insert: raw.insert, before: raw.before, after: raw.after }
      : null;
  }
  if (raw.type === "command") {
    if (typeof raw.id !== "string" || raw.id === "") return null;
    if (raw.args !== undefined && !isObject(raw.args)) return null;
    return raw.args ? { type: "command", id: raw.id, args: raw.args } : { type: "command", id: raw.id };
  }
  return null;
}

function parseMacro(raw: unknown): Macro | null {
  if (!isObject(raw) || typeof raw.name !== "string" || raw.name.trim() === "" || !Array.isArray(raw.steps)) return null;
  const steps: MacroStep[] = [];
  for (const s of raw.steps) {
    const step = parseStep(s);
    if (!step) return null; // a macro with a step we cannot read would replay wrongly, so drop the whole macro
    steps.push(step);
  }
  const macro: Macro = { name: raw.name, steps };
  if (typeof raw.shortcut === "string" && raw.shortcut !== "") macro.shortcut = raw.shortcut;
  return macro;
}

/**
 * Read a macro file leniently: anything unreadable is dropped rather than failing the whole list.
 * A file from a newer version throws, so the caller can leave it alone instead of overwriting it.
 */
export function parseMacroFile(raw: unknown): MacroFile {
  if (!isObject(raw)) return emptyMacroFile();
  if (raw.version !== undefined && raw.version !== MACRO_FILE_VERSION) throw new Error(`Unsupported macro file version: ${String(raw.version)}`);
  const macros: Macro[] = [];
  const seen = new Set<string>();
  for (const m of Array.isArray(raw.macros) ? raw.macros : []) {
    const macro = parseMacro(m);
    if (!macro || seen.has(macro.name)) continue;
    seen.add(macro.name);
    macros.push(macro);
  }
  return { version: MACRO_FILE_VERSION, macros };
}

/** Short human description of a step for toasts such as "Macro stopped at step 3: …". */
export function describeStep(step: MacroStep, labelOf: (id: string) => string = (id) => id): string {
  if (step.type === "command") return labelOf(step.id);
  if (step.insert === "") return "delete";
  const text = step.insert.length > 20 ? `${step.insert.slice(0, 20)}…` : step.insert;
  return `type "${text}"`;
}
