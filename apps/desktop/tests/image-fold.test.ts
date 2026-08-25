import { beforeEach, describe, expect, test } from "vite-plus/test";
import { EditorSelection, EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { GFM } from "@lezer/markdown";
import { foldExtension } from "../src/lib/prosemark-core/main";
import { __testImage, imageExtension } from "../src/lib/prosemark-core/fold/image";

const doc = "before\n\n![diagram](assets/diagram.png)\n\nafter";

function makeState(anchor = 0): EditorState {
  let state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM] }), imageExtension],
    selection: EditorSelection.single(anchor),
  });
  ensureSyntaxTree(state, doc.length, 1000);
  state = state.update({ selection: state.selection }).state;
  return state;
}

function findImageWidget(state: EditorState): { estimatedHeight: number } {
  let found: { estimatedHeight: number } | undefined;
  state.field(foldExtension).between(0, state.doc.length, (_from, _to, decoration) => {
    const widget = (decoration.spec as { widget?: { estimatedHeight?: number } }).widget;
    if (typeof widget?.estimatedHeight === "number") {
      found = widget as { estimatedHeight: number };
    }
  });
  if (!found) throw new Error("Expected a folded image widget");
  return found;
}

describe("imageExtension height stability", () => {
  beforeEach(() => {
    __testImage.imageHeightCache.clear();
  });

  test("unmeasured images report unknown height (-1)", () => {
    const widget = findImageWidget(makeState());
    expect(widget.estimatedHeight).toBe(-1);
  });

  test("widgets rebuilt after a measurement reuse the cached height", () => {
    __testImage.imageHeightCache.set("assets/diagram.png", 240);
    const widget = findImageWidget(makeState());
    expect(widget.estimatedHeight).toBe(240);
  });
});
