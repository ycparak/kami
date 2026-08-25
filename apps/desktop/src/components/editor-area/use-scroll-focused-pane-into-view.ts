import { useEffect, useRef } from "react";
import { useActiveTabId } from "@/hooks/use-tabs";

const SCROLL_BEHAVIOR: ScrollBehavior = "smooth";

const EDGE_TOLERANCE = 1;

export function useScrollFocusedPaneIntoView() {
  const activeTabId = useActiveTabId();
  const hasScrolledRef = useRef(false);

  useEffect(() => {
    if (!activeTabId) return;

    const pane = document.querySelector<HTMLElement>(`[data-pane-id="${CSS.escape(activeTabId)}"]`);
    const row = pane?.closest<HTMLElement>("[data-pane-row]");
    if (!pane || !row) return;

    const isCollapsed = pane.dataset.collapsed === "true";
    const rowRect = row.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();

    const clippedLeft = paneRect.left < rowRect.left - EDGE_TOLERANCE;
    const clippedRight = paneRect.right > rowRect.right + EDGE_TOLERANCE;
    if (!clippedLeft && !clippedRight && !isCollapsed) {
      hasScrolledRef.current = true;
      return;
    }

    const target = isCollapsed
      ? Number(pane.dataset.naturalLeft ?? row.scrollLeft)
      : row.scrollLeft +
        (clippedLeft ? paneRect.left - rowRect.left : paneRect.right - rowRect.right);
    row.scrollTo({
      left: target,
      behavior: hasScrolledRef.current ? SCROLL_BEHAVIOR : "auto",
    });
    hasScrolledRef.current = true;
  }, [activeTabId]);
}
