import {
  EditorState,
  Extension,
  SelectionRange,
  StateEffect,
  StateField,
  Transaction,
} from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { unfurlFreezeFacet, unfurlSuppressFacet } from "@/lib/prosemark-core/main";

const startDragEffect = StateEffect.define<readonly SelectionRange[]>();
const endDragEffect = StateEffect.define<null>();

const dragFrozenSelectionField = StateField.define<readonly SelectionRange[] | null>({
  create() {
    return null;
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(startDragEffect)) return e.value;
      if (e.is(endDragEffect)) return null;
    }
    if (value && tr.docChanged) {
      return value.map((r) => r.map(tr.changes));
    }
    return value;
  },
});

function rangesTouchInclusive(
  ranges: readonly SelectionRange[],
  node: { from: number; to: number },
): boolean {
  for (const r of ranges) {
    if (r.from <= node.to && node.from <= r.to) return true;
  }
  return false;
}

const NO_RANGES: readonly SelectionRange[] = [];

function getEffectiveSelectionRanges(state: EditorState): readonly SelectionRange[] {
  if (state.facet(unfurlSuppressFacet)) return NO_RANGES;
  return state.field(dragFrozenSelectionField, false) ?? state.selection.ranges;
}

const DRAG_END_USER_EVENT = "select.pointer.drag-end";

function shouldStartDragGate(
  state: EditorState,
  event: { isPrimary: boolean; button: number; target: EventTarget | null },
): { effects: StateEffect<readonly SelectionRange[]> } | null {
  if (!event.isPrimary || event.button !== 0) return null;
  const target = event.target as { closest?: (sel: string) => Element | null } | null;
  if (target && typeof target.closest === "function" && target.closest(".cm-mermaid-widget")) {
    return null;
  }
  if (state.field(dragFrozenSelectionField, false) !== null) return null;
  return { effects: startDragEffect.of(state.selection.ranges) };
}

function buildEndDragDispatch(state: EditorState): {
  selection: typeof state.selection;
  effects: StateEffect<null>;
  userEvent: string;
} | null {
  if (state.field(dragFrozenSelectionField, false) === null) return null;
  return {
    selection: state.selection,
    effects: endDragEffect.of(null),
    userEvent: DRAG_END_USER_EVENT,
  };
}

const dragSelectionPlugin = ViewPlugin.fromClass(
  class {
    private readonly onWindowPointerUp: (e: PointerEvent) => void;
    private readonly onWindowPointerCancel: (e: PointerEvent) => void;
    private readonly onContentPointerDown: (e: PointerEvent) => void;
    private readonly onContentBlur: () => void;

    constructor(private readonly view: EditorView) {
      this.onContentPointerDown = (e: PointerEvent) => {
        const dispatch = shouldStartDragGate(this.view.state, e);
        if (dispatch) this.view.dispatch(dispatch);
      };
      this.onWindowPointerUp = () => this.endDrag();
      this.onWindowPointerCancel = () => this.endDrag();
      this.onContentBlur = () => this.endDrag();

      this.view.contentDOM.addEventListener("pointerdown", this.onContentPointerDown);
      this.view.contentDOM.addEventListener("blur", this.onContentBlur);
      window.addEventListener("pointerup", this.onWindowPointerUp);
      window.addEventListener("pointercancel", this.onWindowPointerCancel);
    }

    private endDrag(): void {
      const dispatch = buildEndDragDispatch(this.view.state);
      if (dispatch) {
        this.view.dispatch({
          selection: dispatch.selection,
          effects: dispatch.effects,
          annotations: Transaction.userEvent.of(dispatch.userEvent),
        });
      }
    }

    destroy(): void {
      this.view.contentDOM.removeEventListener("pointerdown", this.onContentPointerDown);
      this.view.contentDOM.removeEventListener("blur", this.onContentBlur);
      window.removeEventListener("pointerup", this.onWindowPointerUp);
      window.removeEventListener("pointercancel", this.onWindowPointerCancel);
    }
  },
);

const dragFreezeExtensions: Extension = [
  dragFrozenSelectionField,
  dragSelectionPlugin,
  unfurlFreezeFacet.compute(
    [dragFrozenSelectionField],
    (state) => state.field(dragFrozenSelectionField, false) !== null,
  ),
];

export {
  DRAG_END_USER_EVENT,
  buildEndDragDispatch,
  dragFreezeExtensions,
  dragFrozenSelectionField,
  dragSelectionPlugin,
  endDragEffect,
  getEffectiveSelectionRanges,
  rangesTouchInclusive,
  shouldStartDragGate,
  startDragEffect,
};
