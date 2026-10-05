import type { Transaction } from "@codemirror/state";
import type { ViewUpdate } from "@codemirror/view";
import type { App } from "../app/app";
import type { FindState } from "../search/findController";
import type { MacroStep, TextStep } from "./model";
import { navHooks } from "./navCommands";

export type FindAction = "findNext" | "replace" | "replaceAll";

/**
 * Captures what the user does into macro steps (spec: macro-recording, design D2): typed, pasted and deleted
 * text relative to the selection, navigation keys, registry commands and Find/Replace actions with their options.
 * It only records; the controller decides which commands are recordable.
 */
export class MacroRecorder {
  private steps: MacroStep[] = [];
  private active = false;
  private pauses = 0;
  private commandDepth = 0;
  private listeners = new Set<() => void>();
  private unsubs: (() => void)[] = [];
  private onKey = (name: string) => this.recordKey(name);

  constructor(app: App) {
    this.unsubs.push(app.onEditorUpdate((u) => this.recordUpdate(u)));
    navHooks.add(this.onKey);
  }

  dispose(): void {
    navHooks.delete(this.onKey);
    for (const off of this.unsubs) off();
  }

  get recording(): boolean {
    return this.active;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  start(): void {
    this.steps = [];
    this.active = true;
    this.emit();
  }

  /** Stop and return the recorded steps (empty when nothing was being recorded). */
  stop(): MacroStep[] {
    if (!this.active) return [];
    this.active = false;
    const steps = this.steps;
    this.steps = [];
    this.emit();
    return steps;
  }

  /** Playback pauses recording so replayed steps are not recorded again. */
  pause(): void {
    this.pauses++;
  }

  resume(): void {
    this.pauses = Math.max(0, this.pauses - 1);
  }

  /** Run a command body; edits it makes synchronously are the command's own, so they are not recorded as typing. */
  runningCommand<T>(fn: () => T): T {
    this.commandDepth++;
    try {
      return fn();
    } finally {
      this.commandDepth--;
    }
  }

  recordCommand(id: string, args?: Record<string, unknown>): void {
    // A command in progress only suppresses its own edits being taken for typing (see recordUpdate), not further steps.
    if (!this.active || this.pauses > 0) return;
    this.steps.push(args ? { type: "command", id, args } : { type: "command", id });
  }

  recordKey(name: string): void {
    this.recordCommand(`key.${name}`);
  }

  recordFind(action: FindAction, state: FindState): void {
    // Deep copy: the Find dialog keeps mutating its state object after the action.
    this.recordCommand(`find.${action}`, { state: JSON.parse(JSON.stringify(state)) });
  }

  private acceptingText(): boolean {
    return this.active && this.pauses === 0 && this.commandDepth === 0;
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private recordUpdate(update: ViewUpdate): void {
    if (!this.acceptingText()) return;
    for (const tr of update.transactions) this.recordTransaction(tr);
  }

  private recordTransaction(tr: Transaction): void {
    if (!tr.docChanged) return;
    // Only things the user typed or deleted; commands, undo/redo and programmatic edits are recorded elsewhere or not at all.
    if (!(tr.isUserEvent("input") || tr.isUserEvent("delete")) || tr.isUserEvent("undo") || tr.isUserEvent("redo")) return;
    let from = 0;
    let to = 0;
    let insert = "";
    let count = 0;
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, text) => {
      count++;
      from = fromA;
      to = toA;
      insert = text.toString();
    });
    // Multi-caret edits have no single position relative to the main selection, so they are not recorded.
    if (count !== 1) return;
    const sel = tr.startState.selection.main;
    // The edit must cover the selection to be replayable relative to it.
    if (from > sel.from || to < sel.to) return;
    this.pushText({ type: "text", insert, before: sel.from - from, after: to - sel.to }, sel.empty);
  }

  private pushText(step: TextStep, caretOnly: boolean): void {
    const last = this.steps[this.steps.length - 1];
    if (last?.type === "text" && caretOnly) {
      const typing = last.before === 0 && last.after === 0;
      // More typing right after typing.
      if (typing && step.before === 0 && step.after === 0 && step.insert !== "") {
        last.insert += step.insert;
        return;
      }
      // A backspace right after typing takes back the last typed character.
      if (typing && last.insert !== "" && step.insert === "" && step.before === 1 && step.after === 0) {
        last.insert = last.insert.slice(0, -1);
        if (last.insert === "") this.steps.pop();
        return;
      }
      // Repeated backspaces or forward deletes.
      if (last.insert === "" && step.insert === "" && last.after === 0 && step.after === 0 && step.before === 1 && last.before > 0) {
        last.before += 1;
        return;
      }
      if (last.insert === "" && step.insert === "" && last.before === 0 && step.before === 0 && step.after === 1 && last.after > 0) {
        last.after += 1;
        return;
      }
    }
    this.steps.push(step);
  }
}
