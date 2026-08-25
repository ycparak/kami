import { describe, expect, test, beforeEach } from "vite-plus/test";
import { EditorState, EditorSelection } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { syntaxTree } from "@codemirror/language";
import { foldExtension, prosemarkMarkdownSyntaxExtensions } from "../src/lib/prosemark-core/main";
import { renderMath, clearMathCache } from "../src/components/editor-area/math-renderer";
import { mathDecorations } from "../src/components/editor-area/math-decorations";

function parseState(doc: string) {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM, prosemarkMarkdownSyntaxExtensions] })],
  });
}

function mathNodes(doc: string): string[] {
  const state = parseState(doc);
  const found: string[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === "Math") found.push(state.doc.sliceString(node.from, node.to));
    },
  });
  return found;
}

describe("math markdown parsing", () => {
  test("parses inline $...$ math", () => {
    expect(mathNodes("Euler: $e^{i\\pi} + 1 = 0$ wow")).toEqual(["$e^{i\\pi} + 1 = 0$"]);
  });

  test("parses display $$...$$ math", () => {
    expect(mathNodes("Sum: $$\\sum_{i=1}^n i$$ done")).toEqual(["$$\\sum_{i=1}^n i$$"]);
  });

  test("escaped \\$ does not open math", () => {
    expect(mathNodes("costs \\$5 and \\$10")).toEqual([]);
  });

  test("currency amounts do not become math", () => {
    expect(mathNodes("I paid $5 and $10 more")).toEqual([]);
  });

  test("opener followed by whitespace does not start inline math", () => {
    expect(mathNodes("a $ b$ c")).toEqual([]);
  });

  test("content ending with whitespace does not close inline math", () => {
    expect(mathNodes("a $b $ c")).toEqual([]);
  });

  test("valid math still parses next to currency-looking text", () => {
    expect(mathNodes("pay $x+y$ dollars")).toEqual(["$x+y$"]);
  });

  test("display math tolerates surrounding whitespace in content", () => {
    expect(mathNodes("$$ x^2 $$")).toEqual(["$$ x^2 $$"]);
  });
});

describe("renderMath", () => {
  beforeEach(() => {
    clearMathCache();
  });

  test("renders a formula to KaTeX markup", () => {
    const result = renderMath("x^2", false);
    expect(result.error).toBeUndefined();
    expect(result.html).toContain("katex");
  });

  test("display mode produces katex-display markup", () => {
    const result = renderMath("\\sum_{i=1}^n i", true);
    expect(result.html).toContain("katex-display");
  });

  test("inline mode does not produce katex-display markup", () => {
    const result = renderMath("x^2", false);
    expect(result.html).not.toContain("katex-display");
  });

  test("same formula in different modes is cached separately", () => {
    const inline = renderMath("x^2", false);
    const display = renderMath("x^2", true);
    expect(inline.html).not.toBe(display.html);
    expect(renderMath("x^2", false).html).toBe(inline.html);
    expect(renderMath("x^2", true).html).toBe(display.html);
  });

  test("soft errors render in error color instead of failing", () => {
    const result = renderMath("\\unknowncommand", false);
    expect(result.error).toBeUndefined();
    expect(result.html).toBeDefined();
  });
});

describe("mathDecorations fold behavior", () => {
  const before = "text ";
  const math = "$a+b$";
  const doc = `${before}${math} after`;
  const mathFrom = before.length;
  const mathTo = mathFrom + math.length;

  function makeState(selection: { anchor: number; head?: number }) {
    return EditorState.create({
      doc,
      extensions: [
        markdown({ extensions: [GFM, prosemarkMarkdownSyntaxExtensions] }),
        mathDecorations(),
      ],
      selection: EditorSelection.single(selection.anchor, selection.head),
    });
  }

  function hasReplaceOverMath(state: EditorState): boolean {
    const set = state.field(foldExtension);
    let found = false;
    set.between(0, doc.length, (from, to) => {
      if (from === mathFrom && to === mathTo) {
        found = true;
        return false;
      }
      return undefined;
    });
    return found;
  }

  test("caret outside math → rendered widget replaces the source", () => {
    expect(hasReplaceOverMath(makeState({ anchor: 0 }))).toBe(true);
  });

  test("caret inside math → source stays visible", () => {
    expect(hasReplaceOverMath(makeState({ anchor: mathFrom + 2 }))).toBe(false);
  });

  test("range selection covering math → source stays visible", () => {
    expect(hasReplaceOverMath(makeState({ anchor: mathTo, head: mathFrom }))).toBe(false);
  });

  test("whitespace-only display math renders no widget", () => {
    const blankDoc = "x $$  $$ y";
    const state = EditorState.create({
      doc: blankDoc,
      extensions: [
        markdown({ extensions: [GFM, prosemarkMarkdownSyntaxExtensions] }),
        mathDecorations(),
      ],
      selection: EditorSelection.single(0),
    });
    let count = 0;
    state.field(foldExtension).between(0, blankDoc.length, () => {
      count++;
    });
    expect(count).toBe(0);
  });
});
