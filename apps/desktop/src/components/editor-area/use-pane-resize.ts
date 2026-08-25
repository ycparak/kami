import { useCallback, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useClearPaneWidthOverride, useSetPaneWidthOverride } from "@/hooks/use-pane-layout";

const MAX_WIDTH_VIEWPORT_FRACTION = 0.7;

export function usePaneResize(minWidth: number, onResize?: () => void) {
  const setOverride = useSetPaneWidthOverride();
  const clearOverride = useClearPaneWidthOverride();
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);

  const startResize = useCallback(
    (tabId: string) => (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;

      const paneEl = document.querySelector<HTMLElement>(`[data-pane-id="${CSS.escape(tabId)}"]`);
      if (!paneEl || paneEl.dataset.collapsed === "true") return;

      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startWidth = paneEl.getBoundingClientRect().width;
      const maxWidth = document.documentElement.clientWidth * MAX_WIDTH_VIEWPORT_FRACTION;
      setDraggingTabId(tabId);

      const handleMove = (moveEvent: PointerEvent) => {
        const next = Math.min(
          maxWidth,
          Math.max(minWidth, startWidth + (moveEvent.clientX - startX)),
        );
        setOverride(tabId, next);
        onResize?.();
      };
      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        setDraggingTabId(null);
      };
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [minWidth, onResize, setOverride],
  );

  const resetResize = useCallback((tabId: string) => () => clearOverride(tabId), [clearOverride]);

  return { draggingTabId, startResize, resetResize };
}
