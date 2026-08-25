import { Facet, type EditorState, type SelectionRange } from "@codemirror/state";

export const unfurlFreezeFacet = Facet.define<boolean, boolean>({
  combine: (values) => values.some(Boolean),
});

export const unfurlSuppressFacet = Facet.define<boolean, boolean>({
  combine: (values) => values.some(Boolean),
});

const NO_RANGES: readonly SelectionRange[] = [];

export function unfurlSelectionRanges(state: EditorState): readonly SelectionRange[] {
  return state.facet(unfurlSuppressFacet) ? NO_RANGES : state.selection.ranges;
}

export function unfurlSuppressChanged(tr: {
  startState: EditorState;
  state: EditorState;
}): boolean {
  return tr.startState.facet(unfurlSuppressFacet) !== tr.state.facet(unfurlSuppressFacet);
}
