import type { App } from "../app/app";
import type { Command } from "../app/commands";
import type { FindController } from "../search/findController";
import { describeStep, type Macro } from "./model";
import type { MacroPlayer, PlayOptions } from "./player";
import type { MacroRecorder } from "./recorder";
import { recordability } from "./recordable";
import type { MacroStore } from "./store";

export type RunChoice = { times: number } | { untilEof: true };

/** The dialogs the controller needs; the real ones live in dialogs.ts, tests pass fakes. */
export interface MacroPrompts {
  askName(initial: string): Promise<string | null>;
  askRun(): Promise<RunChoice | null>;
  manage(): void;
}

export interface MacroControllerDeps {
  app: App;
  finder: FindController;
  store: MacroStore;
  recorder: MacroRecorder;
  player: MacroPlayer;
  prompts: MacroPrompts;
  notify: (message: string, kind: "info" | "error") => void;
  /** Human label for a command id, used in failure messages. */
  labelOf?: (id: string) => string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Ties the recorder, player and store to the Macro menu (spec: macro-recording). The "current" macro is the last
 * one recorded or run; Playback, Run Multiple Times and Save As all act on it. Recording and playback exclude each other.
 */
export class MacroController {
  /** Last recorded or last run macro; its name is empty until it is saved. */
  current: Macro | null = null;

  constructor(private deps: MacroControllerDeps) {
    deps.finder.onAction = (action, state) => deps.recorder.recordFind(action, state);
  }

  /**
   * Wrap the command registry so commands run while recording are captured. A command that opens a dialog or a
   * tab still runs but is not recorded, and the user is told. The macro commands themselves are never recorded.
   */
  wrapCommands(commands: Command[]): Command[] {
    return commands.map((cmd) => {
      if (cmd.id.startsWith("macro.")) return cmd;
      return {
        ...cmd,
        run: () => {
          if (this.deps.recorder.recording) {
            const kind = recordability(cmd.id);
            if (kind === "record") this.deps.recorder.recordCommand(cmd.id);
            else if (kind === "refuse") this.deps.notify(`"${cmd.label}" cannot be recorded in a macro`, "error");
          }
          return this.deps.recorder.runningCommand(() => cmd.run());
        },
      };
    });
  }

  startRecording(): void {
    const { recorder, player, notify } = this.deps;
    if (player.playing) return notify("A macro is playing; wait for it to finish before recording", "error");
    if (recorder.recording) return;
    recorder.start();
    notify("Recording macro… (Macro > Stop Recording when done)", "info");
  }

  stopRecording(): void {
    const { recorder, notify } = this.deps;
    if (!recorder.recording) return;
    const steps = recorder.stop();
    if (steps.length === 0) return notify("Nothing was recorded", "info");
    this.current = { name: "", steps };
    notify(`Recorded macro (${plural(steps.length, "step")})`, "info");
  }

  async playback(options: PlayOptions = {}): Promise<void> {
    const { recorder, notify } = this.deps;
    if (recorder.recording) return notify("Stop recording before playing a macro", "error");
    if (!this.current) return notify("No macro to play. Record one first (Macro > Start Recording)", "info");
    await this.play(this.current, options);
  }

  async runMultiple(): Promise<void> {
    const { recorder, notify, prompts } = this.deps;
    if (recorder.recording) return notify("Stop recording before playing a macro", "error");
    if (!this.current) return notify("No macro to play. Record one first (Macro > Start Recording)", "info");
    const choice = await prompts.askRun();
    if (!choice) return;
    await this.play(this.current, "untilEof" in choice ? { untilEof: true } : { times: choice.times });
  }

  async saveAs(): Promise<void> {
    const { notify, prompts, store } = this.deps;
    if (!this.current || this.current.steps.length === 0) return notify("Record a macro first, then save it", "info");
    const name = await prompts.askName(this.current.name);
    if (name === null) return;
    try {
      const macro: Macro = { name: name.trim(), steps: this.current.steps };
      await store.save(macro);
      this.current = macro;
      notify(`Saved macro "${macro.name}"`, "info");
    } catch (e) {
      notify(`Could not save the macro: ${e instanceof Error ? e.message : e}`, "error");
    }
  }

  async runSaved(name: string): Promise<void> {
    const { recorder, store, notify } = this.deps;
    if (recorder.recording) return notify("Stop recording before playing a macro", "error");
    const macro = store.get(name);
    if (!macro) return notify(`Macro not found: ${name}`, "error");
    this.current = macro;
    await this.play(macro, {});
  }

  manage(): void {
    this.deps.prompts.manage();
  }

  /** One menu command per saved macro, in file order. */
  savedCommands(): Command[] {
    return this.deps.store.list().map((m, i) => ({ id: `macro.run.${i}`, label: m.name, run: () => this.runSaved(m.name) }));
  }

  private async play(macro: Macro, options: PlayOptions): Promise<void> {
    const { app, player, notify, labelOf } = this.deps;
    const result = await player.play(macro, options);
    // Menu clicks leave focus on the menu; hand it back so the next keystroke (or Undo) goes to the document.
    app.view.focus();
    if (!result.ok && result.failure) {
      const f = result.failure;
      const where = f.step > 0 ? `step ${f.step} (${f.description || describeStep(macro.steps[f.step - 1], labelOf)})` : "the start";
      notify(`Macro stopped at ${where}: ${f.reason}`, "error");
    } else if (result.capped) {
      notify(`Macro stopped after ${plural(result.iterations, "run")} (safety limit)`, "info");
    }
  }
}
