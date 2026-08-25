import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { DirEntry } from "@/types/fs";
import type { FlatTreeItem } from "./flatten-tree";
import { canMoveInto, resolveDropDir, resolveDropRange } from "./tree-move";
import type { MoveOutcome } from "./use-move-entry";

export interface DropHighlight {
  top: number;
  height: number;
}

export interface DragGhostState {
  entry: DirEntry;
  count: number;
  width: number;
  paddingLeft: string;
  isExpanded: boolean;
}

const DRAG_THRESHOLD_PX = 4;
const AUTO_SCROLL_EDGE_PX = 28;
const AUTO_SCROLL_SPEED_PX = 8;

interface UseTreeDragArgs {
  rootPath: string;
  flatItems: FlatTreeItem[];
  entryByPath: Map<string, DirEntry>;
  expandedDirs: Set<string>;
  moveEntry: (entry: DirEntry, destDir: string) => Promise<MoveOutcome>;
  toggleDirectory: (path: string) => Promise<void>;
  clearSelection: () => void;
}

interface PendingDrag {
  pointerId: number;
  startX: number;
  startY: number;
  grabOffsetX: number;
  grabOffsetY: number;
  rowWidth: number;
  rowPaddingLeft: string;
  primary: DirEntry;
  entries: DirEntry[];
  started: boolean;
}

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (/(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function rowPathAtY(container: HTMLElement, y: number): string | null {
  const rows = container.querySelectorAll<HTMLElement>("[data-tree-path]");
  let above: string | null = null;
  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    if (y < rect.top) break;
    if (y <= rect.bottom) return row.getAttribute("data-tree-path");
    above = row.getAttribute("data-tree-path");
  }
  return above;
}

function suppressNextClick() {
  const handler = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    window.removeEventListener("click", handler, true);
  };
  window.addEventListener("click", handler, true);
  setTimeout(() => window.removeEventListener("click", handler, true), 0);
}

export function useTreeDrag({
  rootPath,
  flatItems,
  entryByPath,
  expandedDirs,
  moveEntry,
  toggleDirectory,
  clearSelection,
}: UseTreeDragArgs) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);

  const [draggingPaths, setDraggingPaths] = useState<Set<string> | null>(null);
  const [dropTargetDir, setDropTargetDir] = useState<string | null>(null);
  const [dropHighlight, setDropHighlight] = useState<DropHighlight | null>(null);
  const [dragGhost, setDragGhost] = useState<DragGhostState | null>(null);

  const latest = useRef({
    rootPath,
    entryByPath,
    expandedDirs,
    moveEntry,
    toggleDirectory,
    clearSelection,
  });
  latest.current = {
    rootPath,
    entryByPath,
    expandedDirs,
    moveEntry,
    toggleDirectory,
    clearSelection,
  };

  const pendingRef = useRef<PendingDrag | null>(null);
  const pointerPosRef = useRef({ x: 0, y: 0 });
  const dropTargetRef = useRef<string | null>(null);
  const scrollParentRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const positionGhost = useCallback(() => {
    const ghost = ghostRef.current;
    const pending = pendingRef.current;
    if (!ghost || !pending) return;
    const { x, y } = pointerPosRef.current;
    ghost.style.transform = `translate(${x - pending.grabOffsetX}px, ${y - pending.grabOffsetY}px)`;
    ghost.style.opacity = "1";
  }, []);

  const updateDropTarget = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    const { x, y } = pointerPosRef.current;
    const { rootPath: root, entryByPath: entries } = latest.current;
    const container = containerRef.current;

    let dest: string | null = null;
    if (container) {
      const rect = container.getBoundingClientRect();
      const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      if (inside) {
        const path = rowPathAtY(container, y);
        const target = path ? (entries.get(path) ?? null) : null;
        dest = resolveDropDir(target, root);
      }
    }

    const valid =
      dest !== null && pending.entries.some((en) => canMoveInto(en.path, en.is_dir, dest!));
    const next = valid ? dest : null;
    if (dropTargetRef.current !== next) {
      dropTargetRef.current = next;
      setDropTargetDir(next);
    }
  }, []);

  const tick = useCallback(() => {
    const scroller = scrollParentRef.current;
    if (scroller) {
      const rect = scroller.getBoundingClientRect();
      const y = pointerPosRef.current.y;
      if (y < rect.top + AUTO_SCROLL_EDGE_PX) {
        scroller.scrollTop -= AUTO_SCROLL_SPEED_PX;
      } else if (y > rect.bottom - AUTO_SCROLL_EDGE_PX) {
        scroller.scrollTop += AUTO_SCROLL_SPEED_PX;
      }
    }
    positionGhost();
    updateDropTarget();
    rafRef.current = requestAnimationFrame(tick);
  }, [positionGhost, updateDropTarget]);

  const endDrag = useCallback(() => {
    document.body.classList.remove("tree-dragging");
    abortRef.current?.abort();
    abortRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    scrollParentRef.current = null;
    pendingRef.current = null;
    dropTargetRef.current = null;
    setDraggingPaths(null);
    setDropTargetDir(null);
    setDragGhost(null);
  }, []);

  const performDrop = useCallback(async (entries: DirEntry[], dest: string) => {
    const {
      moveEntry: move,
      toggleDirectory: toggle,
      expandedDirs: expanded,
      rootPath: root,
      clearSelection: clear,
    } = latest.current;

    const outcomes = await Promise.all(entries.map((entry) => move(entry, dest)));
    clear();

    if (dest !== root && !expanded.has(dest)) {
      void toggle(dest);
    }

    const failures: string[] = [];
    for (const outcome of outcomes) {
      if (outcome.status === "exists") {
        failures.push(`• "${outcome.entry.name}" — an item with that name already exists`);
      } else if (outcome.status === "error") {
        const message =
          outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
        failures.push(`• "${outcome.entry.name}" — ${message}`);
      }
    }
    if (failures.length > 0) {
      window.alert(
        `Couldn't move ${failures.length} item${failures.length > 1 ? "s" : ""}:\n${failures.join("\n")}`,
      );
    }
  }, []);

  const handleMove = useCallback(
    (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending || event.pointerId !== pending.pointerId) return;
      pointerPosRef.current = { x: event.clientX, y: event.clientY };

      if (!pending.started) {
        const dx = event.clientX - pending.startX;
        const dy = event.clientY - pending.startY;
        if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
        pending.started = true;
        setDraggingPaths(new Set(pending.entries.map((entry) => entry.path)));
        setDragGhost({
          entry: pending.primary,
          count: pending.entries.length,
          width: pending.rowWidth,
          paddingLeft: pending.rowPaddingLeft,
          isExpanded:
            pending.primary.is_dir && latest.current.expandedDirs.has(pending.primary.path),
        });
        scrollParentRef.current = findScrollParent(containerRef.current);
        document.body.classList.add("tree-dragging");
        rafRef.current = requestAnimationFrame(tick);
      }

      positionGhost();
      updateDropTarget();
    },
    [positionGhost, tick, updateDropTarget],
  );

  const handleEnd = useCallback(
    (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending || event.pointerId !== pending.pointerId) return;
      const { started, entries } = pending;
      const dest = dropTargetRef.current;
      endDrag();
      if (!started) return;
      suppressNextClick();
      if (dest) void performDrop(entries, dest);
    },
    [endDrag, performDrop],
  );

  const beginDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>, entries: DirEntry[], primary: DirEntry) => {
      const rowRect = event.currentTarget.getBoundingClientRect();
      const rowPaddingLeft = getComputedStyle(event.currentTarget).paddingLeft;

      pendingRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        grabOffsetX: event.clientX - rowRect.left,
        grabOffsetY: event.clientY - rowRect.top,
        rowWidth: rowRect.width,
        rowPaddingLeft,
        primary,
        entries,
        started: false,
      };
      pointerPosRef.current = { x: event.clientX, y: event.clientY };

      const controller = new AbortController();
      abortRef.current = controller;
      window.addEventListener("pointermove", handleMove, { signal: controller.signal });
      window.addEventListener("pointerup", handleEnd, { signal: controller.signal });
      window.addEventListener("pointercancel", handleEnd, { signal: controller.signal });
    },
    [handleEnd, handleMove],
  );

  useEffect(() => endDrag, [endDrag]);

  // eslint-disable-next-line react-doctor/no-cascading-set-state
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || dropTargetDir === null) {
      setDropHighlight(null);
      return;
    }
    const range = resolveDropRange(
      flatItems.map((item) => ({ path: item.entry.path, depth: item.depth })),
      dropTargetDir,
      rootPath,
    );
    const startEl =
      range &&
      container.querySelector<HTMLElement>(`[data-tree-path="${CSS.escape(range.startPath)}"]`);
    const endEl =
      range &&
      container.querySelector<HTMLElement>(`[data-tree-path="${CSS.escape(range.endPath)}"]`);
    if (!startEl || !endEl) {
      setDropHighlight(null);
      return;
    }
    const top = startEl.offsetTop;
    setDropHighlight({ top, height: endEl.offsetTop + endEl.offsetHeight - top });
  }, [dropTargetDir, flatItems, rootPath]);

  return { containerRef, ghostRef, draggingPaths, dropHighlight, dragGhost, beginDrag };
}
