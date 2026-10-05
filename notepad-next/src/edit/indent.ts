import { indentLess, indentMore } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { EditorSelection, type StateCommand } from "@codemirror/state";

/**
 * Tab key like Notepad++: with a multi-line selection indent the lines; otherwise insert
 * indentation at the caret - spaces up to the next tab stop, or a tab character when the
 * indent unit is a tab.
 */
export const tabIndent: StateCommand = (target) => {
  const { state, dispatch } = target;
  if (state.readOnly) return false;
  const multiLine = state.selection.ranges.some((r) => !r.empty && state.doc.lineAt(r.from).number !== state.doc.lineAt(r.to).number);
  if (multiLine) return indentMore(target);

  const unit = state.facet(indentUnit);
  const useTab = unit.startsWith("\t");
  const tabWidth = state.tabSize;
  dispatch(
    state.update(
      state.changeByRange((range) => {
        const line = state.doc.lineAt(range.from);
        const col = columnOf(state.sliceDoc(line.from, range.from), tabWidth);
        const insert = useTab ? "\t" : " ".repeat(tabWidth - (col % tabWidth));
        return {
          changes: { from: range.from, to: range.to, insert },
          range: EditorSelection.cursor(range.from + insert.length),
        };
      }),
      { scrollIntoView: true, userEvent: "input" },
    ),
  );
  return true;
};

function columnOf(text: string, tabWidth: number): number {
  let col = 0;
  for (const ch of text) col += ch === "\t" ? tabWidth - (col % tabWidth) : 1;
  return col;
}

export { indentLess, indentMore };
