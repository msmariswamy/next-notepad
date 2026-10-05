import { Decoration, MatchDecorator, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";

const spaceMark = Decoration.mark({ class: "cm-ws-space" });
const tabMark = Decoration.mark({ class: "cm-ws-tab" });

const matcher = new MatchDecorator({
  regexp: /[ \t]/g,
  decoration: (m) => (m[0] === "\t" ? tabMark : spaceMark),
});

/** "Show whitespace": marks spaces and tabs; drawn with CSS so the text itself is untouched. */
export const showWhitespace = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = matcher.createDeco(view);
    }
    update(u: ViewUpdate) {
      this.decorations = matcher.updateDeco(u, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);
