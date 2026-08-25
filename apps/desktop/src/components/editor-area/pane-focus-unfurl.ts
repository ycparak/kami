import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { unfurlSuppressFacet } from "@/lib/prosemark-core/main";

const setPaneFocusedEffect = StateEffect.define<boolean>();

const paneFocusedField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setPaneFocusedEffect)) return effect.value;
    }
    return value;
  },
});

export const paneFocusUnfurl: Extension = [
  paneFocusedField,
  unfurlSuppressFacet.from(paneFocusedField, (focused) => !focused),
  EditorView.editorAttributes.compute([paneFocusedField], (state) => ({
    "data-pane-focused": String(state.field(paneFocusedField)),
  })),
];

export function setPaneFocused(view: EditorView, focused: boolean) {
  if (view.state.field(paneFocusedField, false) === focused) return;
  view.dispatch({ effects: setPaneFocusedEffect.of(focused) });
}
