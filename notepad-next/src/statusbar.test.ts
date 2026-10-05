import { describe, expect, it } from "vitest";
import { EditorSelection } from "@codemirror/state";
import { createEditor } from "./editor/createEditor";
import { statusInfoFor } from "./statusbar";

const meta = { eol: "lf" as const, encoding: "UTF-8", language: "Normal text" };
const mount = (doc: string) => createEditor({ parent: document.body, doc });

describe("statusInfoFor", () => {
  it("reports 1-based line and column", () => {
    const view = mount("ab\ncde");
    view.dispatch({ selection: { anchor: 5 } }); // between "d" and "e" -> line 2, col 3
    const info = statusInfoFor(view, meta);
    expect(info.line).toBe(2);
    expect(info.column).toBe(3);
  });

  it("reports selection length and spanned lines", () => {
    const view = mount("ab\ncde");
    view.dispatch({ selection: EditorSelection.single(1, 5) });
    const info = statusInfoFor(view, meta);
    expect(info.selectionLength).toBe(4);
    expect(info.selectionLines).toBe(2);
  });

  it("reports document length and line count", () => {
    const info = statusInfoFor(mount("ab\ncde"), meta);
    expect(info.length).toBe(6);
    expect(info.lines).toBe(2);
  });
});
