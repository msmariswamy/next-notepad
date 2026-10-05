import type { App } from "../app/app";
import type { Command } from "../app/commands";
import type { FindController, FindState } from "../search/findController";
import { describeStep, type Macro, type MacroStep } from "./model";
import { NAV_COMMANDS } from "./navCommands";
import { isPlayableCommand } from "./recordable";

export interface PlayOptions {
  /** How many times to run the macro (default 1). Ignored when `untilEof` is set. */
  times?: number;
  /** Repeat until the caret reaches the end of the document or stops advancing. */
  untilEof?: boolean;
  /** Safety stop for runaway repeats. */
  maxIterations?: number;
}

export interface PlayFailure {
  /** 1-based step number within the macro. */
  step: number;
  description: string;
  reason: string;
}

export interface PlayResult {
  ok: boolean;
  /** Complete runs of the macro. */
  iterations: number;
  failure?: PlayFailure;
  /** True when the run was cut off by `maxIterations`. */
  capped?: boolean;
}

export interface PlayerDeps {
  app: App;
  commands: () => Command[];
  finder: FindController;
  /** Human label for a command id, for failure messages. */
  labelOf?: (id: string) => string;
}

const DEFAULT_MAX_ITERATIONS = 100_000;

/** A step that stops the run, with the reason shown to the user. */
class StepFailure extends Error {}

/**
 * Replays a macro (spec: macro-recording, design D2). The whole playback, however many times it repeats, is one
 * undo step. Everything is checked before the first step runs so an unknown command never leaves a half-applied macro.
 */
export class MacroPlayer {
  playing = false;

  constructor(private deps: PlayerDeps) {}

  async play(macro: Pick<Macro, "steps">, opts: PlayOptions = {}): Promise<PlayResult> {
    const label = (step: MacroStep) => describeStep(step, this.deps.labelOf);
    if (this.playing) return { ok: false, iterations: 0, failure: { step: 0, description: "playback", reason: "A macro is already playing" } };

    const invalid = this.validate(macro.steps);
    if (invalid) return { ok: false, iterations: 0, failure: { ...invalid, description: label(macro.steps[invalid.step - 1]) } };

    const { app, finder } = this.deps;
    const times = opts.untilEof ? Infinity : Math.max(1, Math.floor(opts.times ?? 1));
    const cap = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const findBefore: FindState = JSON.parse(JSON.stringify(finder.state));
    this.playing = true;
    app.beginUndoGroup();
    let iterations = 0;
    try {
      while (iterations < times && macro.steps.length > 0) {
        if (iterations >= cap) return { ok: true, iterations, capped: true };
        const before = this.caret();
        for (const [i, step] of macro.steps.entries()) {
          try {
            await this.runStep(step);
          } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            return { ok: false, iterations, failure: { step: i + 1, description: label(step), reason } };
          }
        }
        iterations++;
        if (opts.untilEof && this.finishedFile(before)) break;
      }
      return { ok: true, iterations };
    } finally {
      app.endUndoGroup();
      finder.state = findBefore;
      this.playing = false;
    }
  }

  /** Reject unknown or unplayable commands up front. */
  private validate(steps: MacroStep[]): { step: number; reason: string } | null {
    const known = new Set(this.deps.commands().map((c) => c.id));
    for (const [i, step] of steps.entries()) {
      if (step.type !== "command") continue;
      if (!isPlayableCommand(step.id)) return { step: i + 1, reason: "This command cannot be played in a macro" };
      if (step.id.startsWith("key.") ? !(step.id.slice(4) in NAV_COMMANDS) : step.id.startsWith("find.") ? !FIND_ACTIONS.has(step.id) : !known.has(step.id)) {
        return { step: i + 1, reason: `Unknown command: ${step.id}` };
      }
    }
    return null;
  }

  private async runStep(step: MacroStep): Promise<void> {
    const { app, finder } = this.deps;
    if (step.type === "text") {
      const view = app.view;
      const sel = view.state.selection.main;
      const from = Math.max(0, sel.from - step.before);
      const to = Math.min(view.state.doc.length, sel.to + step.after);
      view.dispatch({ changes: { from, to, insert: step.insert }, selection: { anchor: from + step.insert.length }, userEvent: "input.type", scrollIntoView: true });
      return;
    }
    if (step.id.startsWith("key.")) {
      NAV_COMMANDS[step.id.slice(4)](app.view);
      return;
    }
    if (step.id.startsWith("find.")) {
      const state = (step.args as { state?: FindState } | undefined)?.state;
      if (!state) throw new StepFailure("Find step has no search settings");
      finder.state = JSON.parse(JSON.stringify(state));
      try {
        if (step.id === "find.findNext") {
          if (!finder.findNext()) throw new StepFailure("No match found");
        } else if (step.id === "find.replace") {
          finder.replace();
        } else {
          finder.replaceAll();
        }
      } catch (e) {
        if (e instanceof SyntaxError) throw new StepFailure(`Invalid search pattern: ${e.message}`);
        throw e;
      }
      return;
    }
    const cmd = this.deps.commands().find((c) => c.id === step.id);
    if (!cmd) throw new StepFailure(`Unknown command: ${step.id}`);
    await cmd.run();
  }

  private caret(): { head: number; line: number } {
    const state = this.deps.app.view.state;
    const head = state.selection.main.head;
    return { head, line: state.doc.lineAt(head).number };
  }

  /** "Until end of file": done at the end of the document, or when an iteration did not move the caret forward. */
  private finishedFile(before: { head: number; line: number }): boolean {
    const now = this.caret();
    return now.head >= this.deps.app.view.state.doc.length || (now.line <= before.line && now.head <= before.head);
  }
}

const FIND_ACTIONS = new Set(["find.findNext", "find.replace", "find.replaceAll"]);
