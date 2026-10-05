import { Decoration, MatchDecorator, ViewPlugin, WidgetType, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";

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

class EolMarker extends WidgetType {
  constructor(private label: string) {
    super();
  }
  eq(other: EolMarker) {
    return other.label === this.label;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-eol";
    el.textContent = this.label;
    el.setAttribute("aria-hidden", "true");
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

export type EolLabel = "LF" | "CRLF" | "CR";

/**
 * "Show all characters": a marker at every line end (the last line has no line ending).
 * Widgets are decorations only, so copying text never includes them.
 */
export function eolMarkers(label: EolLabel) {
  const marker = Decoration.widget({ widget: new EolMarker(label), side: 1 });
  const build = (view: EditorView): DecorationSet => {
    const ranges = [];
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to; ) {
        const line = view.state.doc.lineAt(pos);
        if (line.number < view.state.doc.lines) ranges.push(marker.range(line.to));
        pos = line.to + 1;
      }
    }
    return Decoration.set(ranges, true);
  };
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) this.decorations = build(u.view);
      }
    },
    { decorations: (v) => v.decorations },
  );
}
