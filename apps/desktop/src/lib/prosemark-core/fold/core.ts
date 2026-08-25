import {
  type EditorState,
  StateField,
  type Range,
  Facet,
  EditorSelection,
  type Extension,
} from "@codemirror/state";
import {
  type DOMEventHandlers,
  Decoration,
  type DecorationSet,
  EditorView,
} from "@codemirror/view";
import { eventHandlersWithClass, type RangeLike, selectionTouchesRange } from "../utils";
import { unfurlFreezeFacet, unfurlSelectionRanges, unfurlSuppressChanged } from "../unfurlFreeze";

import type { SyntaxNodeRef } from "@lezer/common";
import { syntaxTree } from "@codemirror/language";

const buildDecorations = (state: EditorState) => {
  const decorations: Range<Decoration>[] = [];
  const specs = state.facet(foldableSyntaxFacet);
  syntaxTree(state).iterate({
    enter: (node) => {
      const selectionTouchesNodeRange = selectionTouchesRange(unfurlSelectionRanges(state), node);

      const lineage = [];
      let node_: SyntaxNodeRef | null = node;
      while (node_) {
        lineage.push(node_.name);
        node_ = node_.node.parent;
      }
      const path = lineage.reverse().join("/");

      for (const spec of specs) {
        if (spec.nodePath instanceof Function) {
          if (!spec.nodePath(path)) {
            continue;
          }
        } else if (spec.nodePath instanceof Array) {
          if (!spec.nodePath.some((testPath) => path.endsWith(testPath))) {
            continue;
          }
        } else if (!path.endsWith(spec.nodePath)) {
          continue;
        }

        const selectionTouchesRange_ = spec.unfoldZone
          ? selectionTouchesRange(unfurlSelectionRanges(state), spec.unfoldZone(state, node))
          : selectionTouchesNodeRange;

        if (!spec.keepDecorationOnUnfold && selectionTouchesRange_) {
          return;
        }

        if (spec.buildDecorations) {
          const res = spec.buildDecorations(state, node, selectionTouchesRange_);
          if (res instanceof Array) {
            decorations.push(...res);
          } else if (res) {
            decorations.push(res);
          }
        }
      }
    },
  });
  return Decoration.set(decorations, true);
};

export const foldExtension = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state);
  },

  update(deco, tr) {
    if (tr.state.facet(unfurlFreezeFacet)) {
      return tr.docChanged ? deco.map(tr.changes) : deco;
    }
    if (
      tr.docChanged ||
      tr.selection ||
      unfurlSuppressChanged(tr) ||
      syntaxTree(tr.startState) !== syntaxTree(tr.state)
    ) {
      return buildDecorations(tr.state);
    }
    return deco.map(tr.changes);
  },
  provide: (f) => [EditorView.decorations.from(f)],
});

export interface FoldableSyntaxSpec {
  nodePath: string | string[] | ((nodePath: string) => boolean);
  buildDecorations?: (
    state: EditorState,
    node: SyntaxNodeRef,
    selectionTouchesRange: boolean,
  ) => Range<Decoration> | Range<Decoration>[] | undefined;
  unfoldZone?: (state: EditorState, node: SyntaxNodeRef) => RangeLike;
  eventHandlers?: DOMEventHandlers<void>;
  keepDecorationOnUnfold?: boolean;
}

export const foldableSyntaxFacet = Facet.define<FoldableSyntaxSpec, FoldableSyntaxSpec[]>({
  combine(value: readonly FoldableSyntaxSpec[]) {
    return [...value];
  },
  enables: foldExtension,
});

export const selectAllDecorationsOnSelectExtension = (widgetClass: string): Extension =>
  EditorView.domEventHandlers(
    eventHandlersWithClass({
      mousedown: {
        [widgetClass]: (e: MouseEvent, view: EditorView) => {
          const ranges = view.state.selection.ranges;
          if (ranges.length === 0 || ranges[0]?.anchor !== ranges[0]?.head) return;

          const target = e.target as HTMLElement;
          const pos = view.posAtDOM(target);

          const decorations = view.state.field(foldExtension);
          decorations.between(pos, pos, (from: number, to: number) => {
            setTimeout(() => {
              view.dispatch({
                selection: EditorSelection.single(to, from),
              });
            }, 0);
            return false;
          });
        },
      },
    }),
  );
