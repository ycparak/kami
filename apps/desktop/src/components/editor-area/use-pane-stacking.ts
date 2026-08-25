import { useEffect, useRef } from "react";

const TOLERANCE = 1;

export function usePaneStacking(paneCount: number) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef(0);

  const recompute = () => {
    frameRef.current = 0;
    const row = rowRef.current;
    if (!row) return;

    const panes = Array.from(row.querySelectorAll<HTMLElement>(":scope > [data-pane]"));
    const rects = panes.map((pane) => pane.getBoundingClientRect());

    let naturalLeft = 0;
    for (let i = 0; i < panes.length; i++) {
      panes[i]!.dataset.naturalLeft = String(naturalLeft);
      naturalLeft += rects[i]!.width;

      const nextRect = rects[i + 1];
      const collapsed = nextRect !== undefined && nextRect.left - rects[i]!.left <= TOLERANCE;
      panes[i]!.dataset.collapsed = String(collapsed);
    }
  };

  const schedule = () => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(recompute);
  };

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    recompute();
    row.addEventListener("scroll", schedule, { passive: true });
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(row);

    return () => {
      row.removeEventListener("scroll", schedule);
      resizeObserver.disconnect();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-doctor/exhaustive-deps -- paneCount is the resync signal: a pane add/remove needs a fresh recompute, but the listeners themselves don't depend on it.
  }, [paneCount]);

  return { rowRef, recomputeStacking: schedule };
}
