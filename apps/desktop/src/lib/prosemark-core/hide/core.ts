import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { type EditorState, Facet, type Range, StateField } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNodeRef } from "@lezer/common";
import { type RangeLike, rangeTouchesRange } from "../utils";
import { unfurlFreezeFacet, unfurlSelectionRanges, unfurlSuppressChanged } from "../unfurlFreeze";

const hideTheme = EditorView.theme({
  ".cm-hidden-token": {
    fontSize: "0px",
  },
  ".cm-transparent-token": {
    opacity: 0,
  },
});

export const hideInlineDecoration = Decoration.mark({
  class: "cm-hidden-token",
});
export const hideInlineKeepSpaceDecoration = Decoration.mark({
  class: "cm-transparent-token",
});
export const hideInlineReplaceDecoration = Decoration.replace({});
export const hideBlockDecoration = Decoration.replace({
  block: true,
});

const buildDecorations = (state: EditorState) => {
  const decorations: Range<Decoration>[] = [];
  const specs = state.facet(hidableNodeFacet);
  specs.map(checkSpec);

  syntaxTree(state).iterate({
    enter: (node) => {
      const nodeName = node.type.name;
      for (const spec of specs) {
        if (spec.nodeName instanceof Function) {
          if (!spec.nodeName(nodeName)) {
            continue;
          }
        } else if (spec.nodeName instanceof Array) {
          if (!spec.nodeName.includes(nodeName)) {
            continue;
          }
        } else if (nodeName !== spec.nodeName) {
          continue;
        }

        if (spec.predicate && !spec.predicate(state, node)) {
          continue;
        }

        if (spec.unhideZone) {
          const res = spec.unhideZone(state, node);
          if (unfurlSelectionRanges(state).some((range) => rangeTouchesRange(res, range))) {
            continue;
          }
        }

        if (spec.nodeDecoration) {
          decorations.push(spec.nodeDecoration.range(node.from, node.to));
        }

        const hideZone = spec.hideZone ? spec.hideZone(state, node) : node;
        const selectionTouchesHideZone = unfurlSelectionRanges(state).some((range) =>
          rangeTouchesRange(hideZone, range),
        );
        if (selectionTouchesHideZone) {
          continue;
        }

        if (spec.onHide) {
          const res = spec.onHide(state, node);
          if (res instanceof Array) {
            decorations.push(...res);
          } else if (res) {
            decorations.push(res);
          }
        }
        if (spec.subNodeNameToHide) {
          let names: string[];
          if (!Array.isArray(spec.subNodeNameToHide)) {
            names = [spec.subNodeNameToHide];
          } else {
            names = spec.subNodeNameToHide;
          }
          const nameSet = new Set(names);

          const cursor = node.node.cursor();

          cursor.iterate((node) => {
            if (nameSet.has(node.type.name)) {
              decorations.push(
                (spec.block
                  ? hideBlockDecoration
                  : spec.keepSpace
                    ? hideInlineKeepSpaceDecoration
                    : spec.removeFromDOM
                      ? hideInlineReplaceDecoration
                      : hideInlineDecoration
                ).range(node.from, node.to),
              );
            }
          });
        }
      }
    },
  });
  return Decoration.set(decorations, true);
};

export const hideExtension = StateField.define<DecorationSet>({
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
  provide: (f) => [EditorView.decorations.from(f), hideTheme],
});

export interface HidableNodeSpec {
  nodeName: string | string[] | ((nodeName: string) => boolean);
  predicate?: (state: EditorState, node: SyntaxNodeRef) => boolean;
  nodeDecoration?: Decoration;
  subNodeNameToHide?: string | string[];
  onHide?: (
    state: EditorState,
    node: SyntaxNodeRef,
  ) => Range<Decoration> | Range<Decoration>[] | undefined;
  block?: boolean;
  keepSpace?: boolean;
  removeFromDOM?: boolean;
  unhideZone?: (state: EditorState, node: SyntaxNodeRef) => RangeLike;
  hideZone?: (state: EditorState, node: SyntaxNodeRef) => RangeLike;
}

const checkSpec = (spec: HidableNodeSpec) => {
  if (spec.block && spec.keepSpace) {
    console.warn(
      "Only inline hide nodes can maintain space currently, but `block` and `keepSpace` are set in:",
      spec,
    );
  }
};

export const hidableNodeFacet = Facet.define<HidableNodeSpec, HidableNodeSpec[]>({
  combine(value: readonly HidableNodeSpec[]) {
    return [...value];
  },
  enables: hideExtension,
});
