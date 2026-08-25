import type { EditorState } from "@codemirror/state";
import { Decoration, WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import {
  foldableSyntaxFacet,
  selectAllDecorationsOnSelectExtension,
} from "@/lib/prosemark-core/main";
import { renderMath } from "./math-renderer";
import "katex/dist/katex.min.css";
import "./math-widget.css";

class MathWidget extends WidgetType {
  constructor(
    public formula: string,
    public display: boolean,
  ) {
    super();
  }

  eq(other: MathWidget): boolean {
    return this.formula === other.formula && this.display === other.display;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = this.display ? "cm-math-widget cm-math-display" : "cm-math-widget";

    const result = renderMath(this.formula, this.display);
    if (result.error !== undefined) {
      span.classList.add("cm-math-error");
      span.textContent = this.display ? `$$${this.formula}$$` : `$${this.formula}$`;
      span.title = result.error;
      return span;
    }

    span.innerHTML = result.html;
    return span;
  }

  ignoreEvent(_event: Event) {
    return false;
  }
}

function mathFormulaRange(node: SyntaxNodeRef): { from: number; to: number } | null {
  const formula = node.node.getChild("MathFormula");
  return formula ? { from: formula.from, to: formula.to } : null;
}

export function mathDecorations() {
  return [
    foldableSyntaxFacet.of({
      nodePath: "Math",
      buildDecorations: (state: EditorState, node: SyntaxNodeRef) => {
        const range = mathFormulaRange(node);
        if (!range) return;

        const formula = state.doc.sliceString(range.from, range.to);
        if (formula.trim() === "") return;

        const display = state.doc.sliceString(node.from, node.from + 2) === "$$";
        return Decoration.replace({
          widget: new MathWidget(formula, display),
        }).range(node.from, node.to);
      },
    }),
    selectAllDecorationsOnSelectExtension("cm-math-widget"),
  ];
}
