import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditorSelection } from "@codemirror/state";
import { App } from "../app/app";
import type { Command } from "../app/commands";
import { memoryClipboard } from "../app/clipboard";
import { DocumentManager } from "../docs/documentManager";
import { createMockIpc } from "../ipc";
import { FindController } from "../search/findController";
import { DEFAULT_SETTINGS } from "../settings/model";
import { MacroController, type MacroPrompts } from "./controller";
import { MacroPlayer } from "./player";
import { MacroRecorder } from "./recorder";
import { MacroStore } from "./store";
import type { MacroFile } from "./model";

let app: App;
let finder: FindController;
let recorder: MacroRecorder;
let store: MacroStore;
let controller: MacroController;
let notify: ReturnType<typeof vi.fn<(m: string, k: "info" | "error") => void>>;
let prompts: { askName: ReturnType<typeof vi.fn>; askRun: ReturnType<typeof vi.fn>; manage: ReturnType<typeof vi.fn> };
let saved: MacroFile[];
let opened: ReturnType<typeof vi.fn<() => void>>;
let base: Command[];
let wrapped: Command[];

const type = (text: string) => {
  const head = app.view.state.selection.main.head;
  app.view.dispatch({ changes: { from: head, insert: text }, selection: { anchor: head + text.length }, userEvent: "input.type" });
};
const doc = () => app.view.state.doc.toString();
const setDoc = (t: string, anchor = 0) =>
  app.view.dispatch({ changes: { from: 0, to: app.view.state.doc.length, insert: t }, selection: EditorSelection.single(anchor), userEvent: "input.paste" });
const run = (id: string) => wrapped.find((c) => c.id === id)!.run();

beforeEach(async () => {
  document.body.innerHTML = '<div id="tabs"></div><div id="editor"></div><div id="status"></div>';
  notify = vi.fn();
  app = new App({
    editorParent: document.getElementById("editor")!,
    tabsEl: document.getElementById("tabs")!,
    statusEl: document.getElementById("status")!,
    manager: new DocumentManager(),
    platform: { pickOpenPath: vi.fn(), pickSavePath: vi.fn(), pickFolder: vi.fn(), confirmUnsaved: vi.fn(), confirm: vi.fn(), clipboard: memoryClipboard() },
    ipc: createMockIpc({}),
    settings: { get: () => DEFAULT_SETTINGS, subscribe: () => () => {} },
    notify,
  });
  app.start();
  finder = new FindController(app);
  recorder = new MacroRecorder(app);
  saved = [];
  store = new MacroStore(
    createMockIpc({
      load_macros: () => ({ version: 1, macros: [] }),
      save_macros: (args) => void saved.push(args?.file as MacroFile),
    }),
  );
  await store.load();
  opened = vi.fn<() => void>();
  base = [
    { id: "case.upper", label: "UPPERCASE", run: () => app.applyChangesToDoc(app.manager.activeId!, [{ from: 0, to: app.view.state.doc.length, insert: doc().toUpperCase() }]) },
    { id: "file.open", label: "Open…", run: () => opened() },
    { id: "view.wordWrap", label: "Word Wrap", run: vi.fn() },
    { id: "search.findNext", label: "Find Next", run: () => void finder.findNext() },
    { id: "macro.stopRecording", label: "Stop Recording", run: () => controller.stopRecording() },
  ];
  prompts = { askName: vi.fn(async () => "my macro"), askRun: vi.fn(async () => ({ times: 3 })), manage: vi.fn() };
  controller = new MacroController({
    app,
    finder,
    store,
    recorder,
    player: new MacroPlayer({ app, commands: () => base, finder }),
    prompts: prompts as unknown as MacroPrompts,
    notify,
  });
  wrapped = controller.wrapCommands(base);
});

describe("recording", () => {
  it("starts and stops, reporting the step count", () => {
    controller.startRecording();
    expect(recorder.recording).toBe(true);
    expect(notify).toHaveBeenLastCalledWith(expect.stringMatching(/recording/i), "info");
    type("abc");
    controller.stopRecording();
    expect(recorder.recording).toBe(false);
    expect(notify).toHaveBeenLastCalledWith(expect.stringMatching(/1 step/), "info");
  });

  it("records registry commands run while recording", async () => {
    controller.startRecording();
    await run("case.upper");
    controller.stopRecording();
    expect(controller.current?.steps).toEqual([{ type: "command", id: "case.upper" }]);
  });

  it("rejects commands that open dialogs or tabs: they run, are not recorded, and a toast says so", async () => {
    controller.startRecording();
    await run("file.open");
    expect(opened).toHaveBeenCalled();
    expect(notify).toHaveBeenLastCalledWith(expect.stringMatching(/Open….*cannot be recorded/i), "error");
    type("x");
    controller.stopRecording();
    expect(controller.current?.steps).toEqual([{ type: "text", insert: "x", before: 0, after: 0 }]);
  });

  it("does not record or complain about the macro commands themselves", async () => {
    controller.startRecording();
    notify.mockClear();
    await run("macro.stopRecording");
    expect(notify).not.toHaveBeenCalledWith(expect.stringMatching(/cannot be recorded/i), "error");
    expect(controller.current).toBeNull();
  });

  it("does not record the edits a command makes as typing as well", async () => {
    setDoc("abc");
    controller.startRecording();
    await run("case.upper");
    controller.stopRecording();
    expect(controller.current?.steps).toHaveLength(1);
  });

  it("records Find and Replace actions through the Find controller", () => {
    setDoc("a b a");
    controller.startRecording();
    finder.state.pattern = "a";
    finder.state.replacement = "x";
    finder.replaceAll();
    controller.stopRecording();
    expect(controller.current?.steps).toMatchObject([{ type: "command", id: "find.replaceAll", args: { state: { pattern: "a", replacement: "x" } } }]);
  });

  it("Find Next from the Search menu command is recorded once, via the Find controller", async () => {
    setDoc("one two", 0);
    finder.state.pattern = "two";
    controller.startRecording();
    await run("search.findNext");
    controller.stopRecording();
    expect(controller.current?.steps).toMatchObject([{ id: "find.findNext" }]);
  });

  it("an empty recording keeps the previous macro and says nothing was recorded", () => {
    controller.startRecording();
    type("a");
    controller.stopRecording();
    controller.startRecording();
    controller.stopRecording();
    expect(notify).toHaveBeenLastCalledWith(expect.stringMatching(/nothing was recorded/i), "info");
    expect(controller.current?.steps).toHaveLength(1);
  });

  it("does not start a second recording", () => {
    controller.startRecording();
    type("a");
    controller.startRecording();
    controller.stopRecording();
    expect(controller.current?.steps).toHaveLength(1);
  });
});

describe("playback", () => {
  it("says so when there is nothing to play", async () => {
    await controller.playback();
    expect(notify).toHaveBeenLastCalledWith(expect.stringMatching(/no macro/i), "info");
  });

  it("plays the last recorded macro at the caret", async () => {
    controller.startRecording();
    type("X");
    controller.stopRecording();
    setDoc("hello", 2);
    await controller.playback();
    expect(doc()).toBe("heXllo");
  });

  it("refuses to play while recording", async () => {
    controller.startRecording();
    type("a");
    await controller.playback();
    expect(notify).toHaveBeenLastCalledWith(expect.stringMatching(/stop recording/i), "error");
    expect(recorder.recording).toBe(true);
  });

  it("refuses to start recording while a macro plays", async () => {
    controller.startRecording();
    type("a");
    controller.stopRecording();
    const playing = controller.playback();
    controller.startRecording();
    await playing;
    expect(recorder.recording).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/playing/i), "error");
  });

  it("names the failed step in a toast", async () => {
    controller.startRecording();
    finder.state.pattern = "zzz";
    finder.findNext();
    controller.stopRecording();
    setDoc("abc");
    await controller.playback();
    expect(notify).toHaveBeenLastCalledWith(expect.stringMatching(/stopped at step 1.*no match/i), "error");
  });
});

describe("run multiple times", () => {
  it("asks how many times and repeats", async () => {
    controller.startRecording();
    type("x");
    controller.stopRecording();
    setDoc("", 0);
    await controller.runMultiple();
    expect(prompts.askRun).toHaveBeenCalled();
    expect(doc()).toBe("xxx");
  });

  it("does nothing when the dialog is cancelled", async () => {
    controller.startRecording();
    type("x");
    controller.stopRecording();
    prompts.askRun.mockResolvedValueOnce(null);
    setDoc("", 0);
    await controller.runMultiple();
    expect(doc()).toBe("");
  });

  it("supports run until end of file", async () => {
    controller.startRecording();
    recorder.recordKey("cursorCharRight");
    controller.stopRecording();
    prompts.askRun.mockResolvedValueOnce({ untilEof: true });
    setDoc("abcdef", 0);
    await controller.runMultiple();
    expect(app.getSelection().from).toBe(6);
  });
});

describe("saved macros", () => {
  const record = (text: string) => {
    controller.startRecording();
    type(text);
    controller.stopRecording();
  };

  it("saves the current macro under the chosen name", async () => {
    record("x");
    await controller.saveAs();
    expect(saved[saved.length - 1].macros[0]).toMatchObject({ name: "my macro", steps: [{ type: "text", insert: "x" }] });
    expect(notify).toHaveBeenLastCalledWith(expect.stringMatching(/saved macro "my macro"/i), "info");
  });

  it("says so when there is nothing to save", async () => {
    await controller.saveAs();
    expect(saved).toEqual([]);
    expect(notify).toHaveBeenLastCalledWith(expect.stringMatching(/record a macro/i), "info");
  });

  it("does nothing when the name prompt is cancelled", async () => {
    record("x");
    prompts.askName.mockResolvedValueOnce(null);
    await controller.saveAs();
    expect(saved).toEqual([]);
  });

  it("reports a save failure", async () => {
    store = new MacroStore(createMockIpc({ load_macros: () => ({ version: 1, macros: [] }), save_macros: () => { throw new Error("disk full"); } }));
    await store.load();
    controller = new MacroController({ app, finder, store, recorder, player: new MacroPlayer({ app, commands: () => base, finder }), prompts: prompts as unknown as MacroPrompts, notify });
    record("x");
    await controller.saveAs();
    expect(notify).toHaveBeenLastCalledWith(expect.stringMatching(/disk full/), "error");
  });

  it("plays a saved macro by name and makes it the current one", async () => {
    await store.save({ name: "dash", steps: [{ type: "text", insert: "-", before: 0, after: 0 }] });
    setDoc("ab", 1);
    await controller.runSaved("dash");
    expect(doc()).toBe("a-b");
    expect(controller.current?.name).toBe("dash");
    setDoc("cd", 1);
    await controller.playback();
    expect(doc()).toBe("c-d");
  });

  it("lists one command per saved macro for the menu", async () => {
    await store.save({ name: "one", steps: [] });
    await store.save({ name: "two", steps: [] });
    expect(controller.savedCommands().map((c) => [c.id, c.label])).toEqual([
      ["macro.run.0", "one"],
      ["macro.run.1", "two"],
    ]);
  });

  it("opens the manager dialog", () => {
    controller.manage();
    expect(prompts.manage).toHaveBeenCalled();
  });
});
