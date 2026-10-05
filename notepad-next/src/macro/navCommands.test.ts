import { afterEach, describe, expect, it, vi } from "vitest";
import { cursorLineDown, defaultKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, runScopeHandlers } from "@codemirror/view";
import { NAV_COMMANDS, navHooks, recordingKeymap } from "./navCommands";

const views: EditorView[] = [];
const make = (doc: string) => {
  const v = new EditorView({ parent: document.body, state: EditorState.create({ doc, extensions: [keymap.of(recordingKeymap(defaultKeymap))] }) });
  views.push(v);
  return v;
};

afterEach(() => {
  views.splice(0).forEach((v) => v.destroy());
  navHooks.clear();
});

const press = (v: EditorView, key: string, init: KeyboardEventInit = {}) => runScopeHandlers(v, new KeyboardEvent("keydown", { key, ...init }), "editor");

describe("NAV_COMMANDS", () => {
  it("names the cursor and selection commands by their CodeMirror export names", () => {
    expect(NAV_COMMANDS.cursorLineDown).toBe(cursorLineDown);
    expect(Object.keys(NAV_COMMANDS)).toEqual(expect.arrayContaining(["cursorLineUp", "cursorCharLeft", "cursorDocEnd", "selectLineDown", "selectAll"]));
  });

  it("does not include edit commands, which are recorded as text", () => {
    expect(NAV_COMMANDS).not.toHaveProperty("deleteCharBackward");
    expect(NAV_COMMANDS).not.toHaveProperty("insertNewline");
  });
});

describe("recordingKeymap", () => {
  it("still runs the command", () => {
    const v = make("one\ntwo");
    press(v, "ArrowRight");
    expect(v.state.selection.main.head).toBe(1);
  });

  it("reports navigation commands to the hooks by name", () => {
    const hook = vi.fn();
    navHooks.add(hook);
    const v = make("one\ntwo");
    press(v, "ArrowRight");
    press(v, "ArrowRight", { shiftKey: true });
    expect(hook.mock.calls.map((c) => c[0])).toEqual(["cursorCharRight", "selectCharRight"]);
  });

  it("does not report keys that are not navigation", () => {
    const hook = vi.fn();
    navHooks.add(hook);
    const v = make("abc");
    press(v, "Backspace");
    expect(hook).not.toHaveBeenCalled();
  });

  it("does nothing extra when no hook is registered", () => {
    const v = make("one\ntwo");
    expect(() => press(v, "ArrowRight")).not.toThrow();
  });
});
