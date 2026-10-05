import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history, redo, undo } from "@codemirror/commands";
import { splitSync, synced } from "./splitSync";

let primary: EditorView;
let secondary: EditorView;

const make = (doc: string, withHistory: boolean, other: () => EditorView | null) =>
  new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      extensions: [EditorState.allowMultipleSelections.of(true), ...(withHistory ? [history()] : []), splitSync(other)],
    }),
  });

beforeEach(() => {
  primary = make("one\ntwo\nthree", true, () => secondary);
  secondary = make("one\ntwo\nthree", false, () => primary);
});

afterEach(() => {
  primary.destroy();
  secondary.destroy();
  document.body.innerHTML = "";
});

const text = (v: EditorView) => v.state.doc.toString();
const type = (v: EditorView, at: number, insert: string) => v.dispatch({ changes: { from: at, insert }, userEvent: "input.type" });

describe("splitSync", () => {
  it("an edit in the clone appears in the primary", () => {
    type(secondary, 3, "!");
    expect(text(primary)).toBe("one!\ntwo\nthree");
    expect(text(secondary)).toBe("one!\ntwo\nthree");
  });

  it("an edit in the primary appears in the clone", () => {
    type(primary, 0, ">");
    expect(text(secondary)).toBe(">one\ntwo\nthree");
  });

  it("does not loop: each edit is applied exactly once on each side", () => {
    type(secondary, 0, "a");
    type(primary, 0, "b");
    expect(text(primary)).toBe("baone\ntwo\nthree");
    expect(text(secondary)).toBe("baone\ntwo\nthree");
  });

  it("a forwarded edit is annotated so it is not forwarded again", () => {
    let forwarded = 0;
    const probe = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: "x",
        extensions: [EditorView.updateListener.of((u) => u.transactions.forEach((t) => t.annotation(synced) && forwarded++))],
      }),
    });
    probe.dispatch({ changes: { from: 0, insert: "y" }, annotations: synced.of(true) });
    expect(forwarded).toBe(1);
    probe.destroy();
  });

  it("each pane keeps its own selection; a remote edit above shifts it", () => {
    primary.dispatch({ selection: { anchor: 8 } }); // on "two"
    secondary.dispatch({ selection: { anchor: 5 } }); // inside "two"
    type(secondary, 0, "new\n");
    expect(primary.state.selection.main.head).toBe(12);
    expect(secondary.state.selection.main.head).toBe(9);
    expect(primary.state.sliceDoc(0, 12)).toBe("new\none\ntwo\n".slice(0, 12));
  });

  it("a selection-only change is not mirrored", () => {
    secondary.dispatch({ selection: EditorSelection.single(5) });
    expect(primary.state.selection.main.head).toBe(0);
  });
});

describe("one undo history (on the primary)", () => {
  it("typing in the clone is a single entry in the primary history", () => {
    type(secondary, 3, "!");
    undo(primary);
    expect(text(primary)).toBe("one\ntwo\nthree");
    expect(text(secondary)).toBe("one\ntwo\nthree");
  });

  it("undo from the clone's side acts on the primary and reaches both panes", () => {
    type(secondary, 0, "x");
    undo(primary);
    expect(text(secondary)).toBe("one\ntwo\nthree");
  });

  it("redo after undo restores the edit in both panes", () => {
    type(primary, 0, "x");
    undo(primary);
    redo(primary);
    expect(text(primary)).toBe("xone\ntwo\nthree");
    expect(text(secondary)).toBe("xone\ntwo\nthree");
  });

  it("edits from both panes interleave into one history", () => {
    type(secondary, 0, "a");
    primary.dispatch({ changes: { from: primary.state.doc.length, insert: "z" }, userEvent: "input.paste" });
    undo(primary);
    expect(text(primary)).toBe("aone\ntwo\nthree");
    undo(primary);
    expect(text(primary)).toBe("one\ntwo\nthree");
    expect(text(secondary)).toBe("one\ntwo\nthree");
  });

  it("with no other pane the extension does nothing", () => {
    const lone = make("solo", true, () => null);
    type(lone, 0, "x");
    expect(text(lone)).toBe("xsolo");
    lone.destroy();
  });
});
