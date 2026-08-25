import { describe, expect, test } from "vite-plus/test";
import { EditorSelection, EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import {
  defaultHideExtensions,
  hideExtension,
  unfurlFreezeFacet,
} from "../src/lib/prosemark-core/main";
import {
  dragFreezeExtensions,
  dragFrozenSelectionField,
  endDragEffect,
  startDragEffect,
} from "../src/components/editor-area/drag-selection-gate";

const DOC = "# heading\nplain";
const INSIDE_HEADING = 1;
const OUTSIDE_HEADING = 12;

function makeState() {
  return EditorState.create({
    doc: DOC,
    selection: EditorSelection.single(OUTSIDE_HEADING),
    extensions: [markdown({ extensions: [GFM] }), defaultHideExtensions, dragFreezeExtensions],
  });
}

function hideSize(state: EditorState): number {
  return state.field(hideExtension).size;
}

describe("unfurlFreezeFacet integration", () => {
  test("facet is false when no drag is active", () => {
    expect(makeState().facet(unfurlFreezeFacet)).toBe(false);
  });

  test("facet flips true while dragFrozenSelectionField holds a snapshot", () => {
    const s0 = makeState();
    const s1 = s0.update({ effects: startDragEffect.of(s0.selection.ranges) }).state;
    expect(s1.facet(unfurlFreezeFacet)).toBe(true);
    expect(s1.field(dragFrozenSelectionField)).not.toBeNull();
  });

  test("selection change mid-drag does NOT rebuild hideExtension", () => {
    const s0 = makeState();
    const baseline = hideSize(s0);
    expect(baseline).toBeGreaterThan(0);

    const s1 = s0.update({ effects: startDragEffect.of(s0.selection.ranges) }).state;
    const s2 = s1.update({ selection: EditorSelection.single(INSIDE_HEADING) }).state;

    expect(hideSize(s2)).toBe(baseline);
  });

  test("end-drag dispatch rebuilds against the live selection", () => {
    const s0 = makeState();
    const s1 = s0.update({ effects: startDragEffect.of(s0.selection.ranges) }).state;
    const s2 = s1.update({ selection: EditorSelection.single(INSIDE_HEADING) }).state;
    expect(hideSize(s2)).toBeGreaterThan(0);

    const s3 = s2.update({
      selection: s2.selection,
      effects: endDragEffect.of(null),
    }).state;

    expect(s3.facet(unfurlFreezeFacet)).toBe(false);
    expect(hideSize(s3)).toBe(0);
  });

  test("doc changes during freeze still re-map decoration positions", () => {
    const s0 = makeState();
    const before = hideSize(s0);
    const s1 = s0.update({ effects: startDragEffect.of(s0.selection.ranges) }).state;
    const s2 = s1.update({ changes: { from: 0, insert: "xyz" } }).state;
    expect(hideSize(s2)).toBe(before);
  });
});
