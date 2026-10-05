import { EditorView } from "@codemirror/view";
import { createEditor } from "./editor/createEditor";
import { renderStatusBar, type DocMeta } from "./statusbar";

const meta: DocMeta = { eol: "lf", encoding: "UTF-8", language: "Normal text" };
const statusEl = document.getElementById("statusbar")!;

const view = createEditor({
  parent: document.getElementById("editor")!,
  extensions: [
    EditorView.updateListener.of((u) => {
      if (u.docChanged || u.selectionSet) renderStatusBar(statusEl, u.view, meta);
    }),
  ],
});
renderStatusBar(statusEl, view, meta);
view.focus();
