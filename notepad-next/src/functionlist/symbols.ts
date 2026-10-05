import { ensureSyntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

/** One entry of the Function List (spec: function-list). `from` is the document offset used to jump to it. */
export interface Symbol {
  name: string;
  kind: string;
  line: number;
  from: number;
}

interface Ctx {
  state: EditorState;
  text: (n: SyntaxNode) => string;
}

type Extractor = (node: SyntaxNode, ctx: Ctx) => { name: string; kind: string } | null;

/** Text of the first direct child with one of the given node names. */
const childText = (node: SyntaxNode, names: string[], ctx: Ctx): string | null => {
  for (let c = node.firstChild; c; c = c.nextSibling) if (names.includes(c.name)) return ctx.text(c);
  return null;
};

/** A node type that is a symbol whose name is a fixed child node. */
const simple =
  (kind: string, ...nameNodes: string[]): Extractor =>
  (node, ctx) => {
    const name = childText(node, nameNodes, ctx);
    return name ? { name, kind } : null;
  };

const insideClass = (node: SyntaxNode, ...classNodes: string[]) => {
  for (let p = node.parent; p; p = p.parent) if (classNodes.includes(p.name)) return true;
  return false;
};

const jsLike: Record<string, Extractor> = {
  FunctionDeclaration: simple("function", "VariableDefinition"),
  ClassDeclaration: simple("class", "VariableDefinition"),
  MethodDeclaration: simple("method", "PropertyDefinition"),
  InterfaceDeclaration: simple("interface", "TypeDefinition"),
  TypeAliasDeclaration: simple("type", "TypeDefinition"),
  // `const f = () => ...` and `const g = function () {}` count as functions; other consts do not.
  VariableDeclaration: (node, ctx) => {
    let isFn = false;
    for (let c = node.firstChild; c; c = c.nextSibling) if (c.name === "ArrowFunction" || c.name === "FunctionExpression") isFn = true;
    const name = isFn ? childText(node, ["VariableDefinition"], ctx) : null;
    return name ? { name, kind: "function" } : null;
  },
};

const cDeclarator: Extractor = (node, ctx) => {
  const decl = node.getChild("FunctionDeclarator");
  const name = decl && childText(decl, ["Identifier", "ScopedIdentifier", "FieldIdentifier", "QualifiedIdentifier"], ctx);
  return name ? { name, kind: "function" } : null;
};

const cLike: Record<string, Extractor> = {
  FunctionDefinition: cDeclarator,
  ClassSpecifier: simple("class", "TypeIdentifier"),
  StructSpecifier: simple("struct", "TypeIdentifier"),
  NamespaceDefinition: simple("namespace", "Identifier"),
};

const headingText = (node: SyntaxNode, ctx: Ctx): string => {
  const raw = ctx.text(node);
  if (node.name.startsWith("ATX")) return raw.replace(/^#{1,6}\s*/, "").replace(/\s+#+\s*$/, "").trim();
  const mark = node.lastChild;
  return (mark ? ctx.state.sliceDoc(node.from, mark.from) : raw).trim();
};

const markdown: Record<string, Extractor> = Object.fromEntries(
  ["ATXHeading", "SetextHeading"].flatMap((p) =>
    [1, 2, 3, 4, 5, 6].map((n) => [`${p}${n}`, (node: SyntaxNode, ctx: Ctx) => ({ name: headingText(node, ctx), kind: "heading" })] as const),
  ),
);

/** Source text from the node start up to its first Block, whitespace collapsed: `a.b, #c`, `@media print`. */
const beforeBlock =
  (kind: string): Extractor =>
  (node, ctx) => {
    const block = node.getChild("Block");
    const name = ctx.state.sliceDoc(node.from, block ? block.from : node.to).replace(/\s+/g, " ").trim();
    return name ? { name, kind } : null;
  };

const unquote = (s: string) => s.replace(/^["']|["']$/g, "");

/** Per-language rules keyed by Lezer node name (design D3: symbols come from the same tree that drives highlighting). */
const TREE_RULES: Record<string, Record<string, Extractor>> = {
  JavaScript: jsLike,
  TypeScript: jsLike,
  Python: {
    FunctionDefinition: (node, ctx) => {
      const name = childText(node, ["VariableName"], ctx);
      return name ? { name, kind: insideClass(node, "ClassDefinition") ? "method" : "function" } : null;
    },
    ClassDefinition: simple("class", "VariableName"),
  },
  Rust: {
    FunctionItem: simple("function", "BoundIdentifier"),
    StructItem: simple("struct", "TypeIdentifier"),
    EnumItem: simple("enum", "TypeIdentifier"),
    TraitItem: simple("trait", "TypeIdentifier"),
  },
  Go: {
    FunctionDecl: simple("function", "DefName"),
    MethodDecl: simple("method", "FieldName"),
    TypeSpec: simple("type", "DefName"),
  },
  Java: {
    ClassDeclaration: simple("class", "Definition"),
    InterfaceDeclaration: simple("interface", "Definition"),
    EnumDeclaration: simple("enum", "Definition"),
    MethodDeclaration: simple("method", "Definition"),
  },
  "C++": cLike,
  C: cLike,
  CSS: {
    RuleSet: beforeBlock("rule"),
    MediaStatement: beforeBlock("at-rule"),
    SupportsStatement: beforeBlock("at-rule"),
    KeyframesStatement: beforeBlock("at-rule"),
  },
  Markdown: markdown,
  JSON: {
    Property: (node, ctx) => {
      if (node.parent?.name !== "Object" || node.parent.parent?.name !== "JsonText") return null;
      const name = childText(node, ["PropertyName"], ctx);
      return name ? { name: unquote(name), kind: "key" } : null;
    },
  },
  XML: {
    Element: (node, ctx) => {
      if (node.parent?.name !== "Element" || node.parent.parent?.name !== "Document") return null;
      const tag = node.firstChild;
      const tagName = tag && childText(tag, ["TagName"], ctx);
      if (!tag || !tagName) return null;
      let label = "";
      for (let a = tag.firstChild; a; a = a.nextSibling) {
        if (a.name !== "Attribute") continue;
        const key = childText(a, ["AttributeName"], ctx);
        if (key === "id" || key === "name") {
          label = unquote(childText(a, ["AttributeValue"], ctx) ?? "");
          break;
        }
      }
      return { name: label ? `${tagName} ${label}` : tagName, kind: "element" };
    },
  },
  YAML: {
    Pair: (node, ctx) => {
      if (node.parent?.name !== "BlockMapping" || node.parent.parent?.name !== "Document") return null;
      const key = node.getChild("Key");
      return key ? { name: ctx.text(key).trim(), kind: "key" } : null;
    },
  },
};

interface LineRule {
  pattern: RegExp;
  /** Capture group holding the name; the kind is a fixed string or taken from another group. */
  nameGroup: number;
  kind: string | number;
  /** Group-less matches are normalised by this transform (for example HTML tags inside a heading). */
  clean?: (s: string) => string;
}

/** Languages whose grammar exposes no useful symbol nodes: one pattern per line instead. */
const LINE_RULES: Record<string, LineRule[]> = {
  SQL: [
    {
      pattern: /^\s*create\s+(?:or\s+replace\s+)?(?:temp(?:orary)?\s+)?(function|procedure|table|view|trigger|index)\s+(?:if\s+not\s+exists\s+)?([\w."[\]`]+)/i,
      nameGroup: 2,
      kind: 1,
    },
  ],
  HTML: [{ pattern: /<h([1-6])\b[^>]*>(.*?)<\/h\1\s*>/i, nameGroup: 2, kind: "heading", clean: (s) => s.replace(/<[^>]*>/g, "").trim() }],
  Shell: [
    { pattern: /^\s*function\s+([\w.-]+)/, nameGroup: 1, kind: "function" },
    { pattern: /^\s*([\w.-]+)\s*\(\)\s*\{?/, nameGroup: 1, kind: "function" },
  ],
};

function fromLines(state: EditorState, rules: LineRule[]): Symbol[] {
  const out: Symbol[] = [];
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    for (const rule of rules) {
      const m = rule.pattern.exec(line.text);
      if (!m) continue;
      const name = (rule.clean ? rule.clean(m[rule.nameGroup]) : m[rule.nameGroup]).trim();
      if (!name) continue;
      const kind = typeof rule.kind === "number" ? m[rule.kind].toLowerCase() : rule.kind;
      out.push({ name, kind, line: n, from: line.from + m.index });
      break;
    }
  }
  return out;
}

/**
 * Symbols of a document for the Function List. Returns null when the syntax tree is not complete within
 * `budgetMs`, so the caller can keep showing the last complete list instead of an empty or partial one.
 */
export function extractSymbols(state: EditorState, language: string, budgetMs = 50): Symbol[] | null {
  const lineRules = LINE_RULES[language];
  if (lineRules) return fromLines(state, lineRules);
  const rules = TREE_RULES[language];
  if (!rules || state.doc.length === 0) return [];
  const tree = ensureSyntaxTree(state, state.doc.length, budgetMs);
  if (!tree) return null;

  const ctx: Ctx = { state, text: (n) => state.sliceDoc(n.from, n.to) };
  const out: Symbol[] = [];
  tree.iterate({
    enter: (ref) => {
      const rule = rules[ref.name];
      if (!rule) return;
      const found = rule(ref.node, ctx);
      if (found) out.push({ ...found, line: state.doc.lineAt(ref.from).number, from: ref.from });
    },
  });
  return out;
}
