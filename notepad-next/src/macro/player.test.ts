import { beforeEach, describe, expect, it, vi } from "vitest";
import { undo, undoDepth } from "@codemirror/commands";
import { EditorSelection } from "@codemirror/state";
import { App } from "../app/app";
import type { Command } from "../app/commands";
import { memoryClipboard } from "../app/clipboard";
import { DocumentManager } from "../docs/documentManager";
import { createMockIpc } from "../ipc";
import { FindController } from "../search/findController";
import { DEFAULT_SETTINGS } from "../settings/model";
import type { Macro, MacroStep } from "./model";
import { MacroPlayer } from "./player";

let app: App;
let finder: FindController;
let commands: Command[];
let player: MacroPlayer;

const text = (insert: string, before = 0, after = 0): MacroStep => ({ type: "text", insert, before, after });
const cmd = (id: string, args?: Record<string, unknown>): MacroStep => (args ? { type: "command", id, args } : { type: "command", id });
const macro = (...steps: MacroStep[]): Macro => ({ name: "m", steps });
const doc = () => app.view.state.doc.toString();
const setDoc = (t: string, anchor = 0, head = anchor) =>
  app.view.dispatch({ changes: { from: 0, to: app.view.state.doc.length, insert: t }, selection: EditorSelection.single(anchor, head), userEvent: "input.paste" });

beforeEach(() => {
  document.body.innerHTML = '<div id="tabs"></div><div id="editor"></div><div id="status"></div>';
  app = new App({
    editorParent: document.getElementById("editor")!,
    tabsEl: document.getElementById("tabs")!,
    statusEl: document.getElementById("status")!,
    manager: new DocumentManager(),
    platform: { pickOpenPath: vi.fn(), pickSavePath: vi.fn(), pickFolder: vi.fn(), confirmUnsaved: vi.fn(), confirm: vi.fn(), clipboard: memoryClipboard() },
    ipc: createMockIpc({}),
    settings: { get: () => DEFAULT_SETTINGS, subscribe: () => () => {} },
  });
  app.start();
  finder = new FindController(app);
  commands = [
    { id: "case.upper", label: "UPPERCASE", run: () => app.applyChangesToDoc(app.manager.activeId!, [{ from: 0, to: app.view.state.doc.length, insert: doc().toUpperCase() }]) },
    { id: "async.cmd", label: "Async", run: async () => { await Promise.resolve(); app.view.dispatch(app.view.state.replaceSelection("!")); } },
    { id: "boom", label: "Boom", run: () => { throw new Error("it broke"); } },
    { id: "file.open", label: "Open", run: vi.fn() },
    { id: "macro.playback", label: "Playback", run: vi.fn() },
  ];
  player = new MacroPlayer({ app, commands: () => commands, finder });
});

describe("MacroPlayer text steps", () => {
  it("inserts typed text at the caret, wherever it is", async () => {
    setDoc("one two", 3);
    const r = await player.play(macro(text("X")));
    expect(r.ok).toBe(true);
    expect(doc()).toBe("oneX two");
    expect(app.getSelection()).toEqual({ from: 4, to: 4 });
  });

  it("replays at a different position with the same result", async () => {
    setDoc("abc abc", 0);
    await player.play(macro(text("-")));
    app.setSelection({ from: 6, to: 6 });
    await player.play(macro(text("-")));
    expect(doc()).toBe("-abc a-bc");
  });

  it("deletes before and after the caret and replaces a selection", async () => {
    setDoc("hello world", 5);
    await player.play(macro(text("", 1, 1)));
    expect(doc()).toBe("hellworld");
  });

  it("replaces the selection with the typed text", async () => {
    setDoc("hello world", 0, 5);
    await player.play(macro(text("J")));
    expect(doc()).toBe("J world");
  });

  it("clamps deletions at the document edges", async () => {
    setDoc("ab", 0);
    await player.play(macro(text("", 5, 0)));
    expect(doc()).toBe("ab");
    setDoc("ab", 2);
    await player.play(macro(text("", 0, 5)));
    expect(doc()).toBe("ab");
  });
});

describe("MacroPlayer command steps", () => {
  it("runs a registry command by id", async () => {
    setDoc("abc");
    await player.play(macro(cmd("case.upper")));
    expect(doc()).toBe("ABC");
  });

  it("waits for an async command to finish before the next step", async () => {
    setDoc("a", 1);
    await player.play(macro(cmd("async.cmd"), text("?")));
    expect(doc()).toBe("a!?");
  });

  it("runs navigation key steps", async () => {
    setDoc("abc", 0);
    await player.play(macro(cmd("key.cursorCharRight"), cmd("key.cursorCharRight"), text("X")));
    expect(doc()).toBe("abXc");
  });

  it("stops with a reason when a command throws", async () => {
    const r = await player.play(macro(text("a"), cmd("boom"), text("b")));
    expect(r.ok).toBe(false);
    expect(r.failure).toMatchObject({ step: 2, reason: "it broke" });
    expect(doc()).toBe("a");
  });
});

describe("MacroPlayer safety", () => {
  it("refuses a macro with an unknown command id before changing anything", async () => {
    setDoc("keep", 0);
    const r = await player.play(macro(text("X"), cmd("no.such.command")));
    expect(r.ok).toBe(false);
    expect(r.failure).toMatchObject({ step: 2 });
    expect(r.failure!.reason).toMatch(/unknown command/i);
    expect(doc()).toBe("keep");
  });

  it("refuses an unknown key command", async () => {
    const r = await player.play(macro(cmd("key.cursorNowhere")));
    expect(r.ok).toBe(false);
  });

  it("refuses commands that must not be played (dialogs, another macro)", async () => {
    for (const id of ["file.open", "macro.playback"]) {
      const r = await player.play(macro(cmd(id)));
      expect(r.ok, id).toBe(false);
      expect(r.failure!.reason).toMatch(/cannot be played/i);
    }
    expect(commands.find((c) => c.id === "file.open")!.run).not.toHaveBeenCalled();
  });

  it("does not start a second playback while one is running", async () => {
    setDoc("a", 1);
    const first = player.play(macro(cmd("async.cmd")));
    const second = await player.play(macro(text("x")));
    expect(second.ok).toBe(false);
    expect(second.failure!.reason).toMatch(/already/i);
    await first;
    expect(player.playing).toBe(false);
  });
});

describe("MacroPlayer undo", () => {
  it("a whole playback is one undo step", async () => {
    setDoc("one\ntwo", 0);
    const depth = undoDepth(app.view.state);
    await player.play(macro(text("A"), cmd("key.cursorCharRight"), cmd("case.upper"), cmd("key.cursorDocEnd"), text("Z")));
    expect(doc()).toBe("AONE\nTWOZ");
    expect(undoDepth(app.view.state)).toBe(depth + 1);
    undo(app.view);
    expect(doc()).toBe("one\ntwo");
  });

  it("running several times is still one undo step", async () => {
    setDoc("", 0);
    await player.play(macro(text("x")), { times: 4 });
    expect(doc()).toBe("xxxx");
    undo(app.view);
    expect(doc()).toBe("");
  });
});

describe("MacroPlayer find steps", () => {
  const findState = (pattern: string, replacement = "", extra: object = {}) => ({
    state: { pattern, replacement, opts: { mode: "normal", matchCase: false, wholeWord: false, dotAll: false }, backward: false, wrap: false, inSelection: false, ...extra },
  });

  it("replaceAll uses the recorded pattern, replacement and options", async () => {
    setDoc("aaa baa", 0);
    await player.play(macro(cmd("find.replaceAll", findState("a+", "x", { opts: { mode: "regex", matchCase: true, wholeWord: false, dotAll: false } }))));
    expect(doc()).toBe("x bx");
  });

  it("findNext selects the next match", async () => {
    setDoc("one two three", 0);
    await player.play(macro(cmd("find.findNext", findState("two"))));
    expect(app.view.state.sliceDoc(app.getSelection().from, app.getSelection().to)).toBe("two");
  });

  it("a Find with no match stops the playback and names the step", async () => {
    setDoc("one", 0);
    const r = await player.play(macro(text("-"), cmd("find.findNext", findState("zzz")), text("+")));
    expect(r.ok).toBe(false);
    expect(r.failure).toMatchObject({ step: 2 });
    expect(r.failure!.reason).toMatch(/no match/i);
    expect(doc()).toBe("-one");
  });

  it("an invalid regex stops the playback instead of throwing", async () => {
    const r = await player.play(macro(cmd("find.findNext", findState("(", "", { opts: { mode: "regex", matchCase: false, wholeWord: false, dotAll: false } }))));
    expect(r.ok).toBe(false);
  });

  it("restores the user's own Find settings afterwards", async () => {
    finder.state.pattern = "mine";
    setDoc("two", 0);
    await player.play(macro(cmd("find.findNext", findState("two"))));
    expect(finder.state.pattern).toBe("mine");
  });
});

describe("MacroPlayer repeat", () => {
  it("runs a fixed number of times", async () => {
    setDoc("", 0);
    const r = await player.play(macro(text("x")), { times: 3 });
    expect(r).toMatchObject({ ok: true, iterations: 3 });
    expect(doc()).toBe("xxx");
  });

  it("runs once by default", async () => {
    const r = await player.play(macro(text("x")));
    expect(r.iterations).toBe(1);
  });

  it("until end of file: stops once the caret reaches the end", async () => {
    setDoc("abcd", 0);
    const r = await player.play(macro(cmd("key.cursorCharRight")), { untilEof: true });
    expect(r.ok).toBe(true);
    expect(app.getSelection().from).toBe(4);
    expect(r.iterations).toBe(4);
  });

  it("until end of file: stops when the caret cannot advance, without an error", async () => {
    setDoc("abc", 0);
    const r = await player.play(macro(cmd("key.cursorCharRight"), text("", 0, 0)), { untilEof: true });
    expect(r.ok).toBe(true);
    expect(r.failure).toBeUndefined();
  });

  it("until end of file: a macro that does not move the caret runs once", async () => {
    setDoc("abc", 0);
    const r = await player.play(macro(cmd("case.upper")), { untilEof: true });
    expect(r.ok).toBe(true);
    expect(r.iterations).toBe(1);
  });

  it("a failing step stops a repeated run at that step", async () => {
    setDoc("a", 0);
    const r = await player.play(macro(text("x"), cmd("boom")), { times: 5 });
    expect(r.ok).toBe(false);
    expect(r.iterations).toBe(0);
    expect(doc()).toBe("xa");
  });

  it("stops at an iteration cap so a runaway macro cannot hang the app", async () => {
    setDoc("a".repeat(100), 0);
    const r = await player.play(macro(cmd("key.cursorCharRight")), { untilEof: true, maxIterations: 10 });
    expect(r.iterations).toBe(10);
    expect(r.capped).toBe(true);
  });

  it("an empty macro does nothing", async () => {
    setDoc("a", 0);
    const r = await player.play(macro(), { times: 3 });
    expect(r.ok).toBe(true);
    expect(doc()).toBe("a");
  });
});
