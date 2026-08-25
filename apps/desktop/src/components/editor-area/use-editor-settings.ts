import { useCallback } from "react";
import { useSetting } from "@/hooks/use-settings";

export function useEditorSettingsRef() {
  const editorWidth = useSetting("appearance.editor-width");

  return useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      el.style.setProperty("--kami-editor-max-width", editorWidth === "full" ? "100%" : "720px");
    },
    [editorWidth],
  );
}
