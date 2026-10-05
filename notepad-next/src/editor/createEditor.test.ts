import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { foldable } from "@codemirror/language";
import { json } from "@codemirror/lang-json";
import { createEditor } from "./createEditor";

function mount(doc: string, extensions: Extension[] = []) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  return createEditor({ parent, doc, extensions });
}

describe("editor core", () => {
  it("renders the document text", () => {
    const view = mount("hello\nworld");
    expect(view.state.doc.toString()).toBe("hello\nworld");
  });

  it("shows line numbers", () => {
    const view = mount("a\nb\nc");
    expect(view.dom.querySelector(".cm-lineNumbers")).not.toBeNull();
  });

  it("types at multiple carets at once", () => {
    const view = mount("a\nb\nc");
    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(0),
        EditorSelection.cursor(2),
        EditorSelection.cursor(4),
      ]),
    });
    view.dispatch(view.state.replaceSelection("X"));
    expect(view.state.doc.toString()).toBe("Xa\nXb\nXc");
  });

  it("allows multiple selection ranges", () => {
    const view = mount("abc");
    expect(view.state.facet(EditorState.allowMultipleSelections)).toBe(true);
  });

  it("offers a fold range for a multi-line JSON object", () => {
    const view = mount('{\n  "a": 1\n}', [json()]);
    const line = view.state.doc.line(1);
    expect(foldable(view.state, line.from, line.to)).not.toBeNull();
  });
});
