import * as commands from "@codemirror/commands";
import type { EditorView, KeyBinding } from "@codemirror/view";

type ViewCommand = (view: EditorView) => boolean;

/**
 * Caret movement and selection commands, by the name CodeMirror exports them under. A macro stores them as
 * `key.<name>` command steps (design D2: movement is not text and has no menu command, so recording it
 * needs this table). Edit commands such as delete or newline are excluded: they are recorded as text.
 */
export const NAV_COMMANDS: Record<string, ViewCommand> = Object.fromEntries(
  Object.entries(commands).filter(([name, fn]) => typeof fn === "function" && /^(cursor|select)[A-Z]/.test(name)) as [string, ViewCommand][],
);

const NAME_OF = new Map<ViewCommand, string>(Object.entries(NAV_COMMANDS).map(([name, fn]) => [fn, name]));

/** Called with a command name each time a bound navigation key actually ran. The macro recorder registers here. */
export const navHooks = new Set<(name: string) => void>();

/** The key bindings with navigation commands wrapped to report themselves; everything else passes through untouched. */
export function recordingKeymap(bindings: readonly KeyBinding[]): KeyBinding[] {
  const wrap = (fn: ViewCommand | undefined) => {
    const name = fn && NAME_OF.get(fn);
    if (!fn || !name) return fn;
    return (view: EditorView) => {
      const ran = fn(view);
      if (ran) for (const hook of navHooks) hook(name);
      return ran;
    };
  };
  return bindings.map((b) => ({ ...b, run: wrap(b.run), shift: wrap(b.shift) }));
}
