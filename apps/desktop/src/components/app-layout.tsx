import { useCallback, useRef, useState } from "react";
import { Sidebar } from "./sidebar";
import { EditorArea } from "./editor-area";
import { EditorTabs } from "./editor-area/editor-tabs";
import { SidebarToggleButton } from "./sidebar/sidebar-toggle-button";
import { CompactFileLayout } from "./compact-file-layout";
import { useSidebar } from "@/hooks/use-sidebar";
import { useWorkspaceChromeMode } from "@/hooks/use-workspace";
import { useIsEmptyWorkspace } from "@/hooks/use-empty-workspace";
import { EmptyStateActions } from "./empty-state-actions";

function clampSidebarWidth(width: number, maxSidebarWidth: number) {
  return Math.max(220, Math.min(maxSidebarWidth, Math.round(width)));
}

export function AppLayout() {
  const chromeMode = useWorkspaceChromeMode();
  if (chromeMode === "compact-file") {
    return <CompactFileLayout />;
  }

  return <WorkspaceLayout />;
}

function WorkspaceLayout() {
  const { isSidebarCollapsed, sidebarWidth, setSidebarWidth } = useSidebar();
  const isEmptyWorkspace = useIsEmptyWorkspace();
  const viewportWidth = typeof window === "undefined" ? 1200 : window.innerWidth;
  const maxSidebarWidth = Math.max(280, Math.min(420, Math.floor(viewportWidth * 0.35)));
  const draggingRef = useRef(false);
  const [isSidebarDragging, setIsSidebarDragging] = useState(false);
  const [draftSidebarWidth, setDraftSidebarWidth] = useState(() =>
    clampSidebarWidth(sidebarWidth, maxSidebarWidth),
  );
  const draftSidebarWidthRef = useRef(draftSidebarWidth);
  const tabChromeLeft = isSidebarCollapsed ? 132 : draftSidebarWidth + 12;

  const setClampedSidebarWidth = useCallback(
    (nextWidth: number) => {
      const next = clampSidebarWidth(nextWidth, maxSidebarWidth);
      draftSidebarWidthRef.current = next;
      setDraftSidebarWidth(next);
      return next;
    },
    [maxSidebarWidth],
  );

  if (!draggingRef.current) {
    const nextWidth = clampSidebarWidth(sidebarWidth, maxSidebarWidth);
    if (draftSidebarWidth !== nextWidth) {
      draftSidebarWidthRef.current = nextWidth;
      setDraftSidebarWidth(nextWidth);
    }
  }

  const handleSidebarResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;

      event.preventDefault();
      draggingRef.current = true;
      setIsSidebarDragging(true);

      const startX = event.clientX;
      const startWidth = draftSidebarWidthRef.current;
      const previousCursor = document.documentElement.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      document.documentElement.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const cleanup = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerCancel);
        document.documentElement.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        setIsSidebarDragging(false);
      };

      const handlePointerMove = (moveEvent: PointerEvent) => {
        setClampedSidebarWidth(startWidth + moveEvent.clientX - startX);
      };

      const finishDrag = (shouldPersist: boolean) => {
        cleanup();
        draggingRef.current = false;

        const nextWidth = draftSidebarWidthRef.current;
        if (shouldPersist && nextWidth !== sidebarWidth) {
          void setSidebarWidth(nextWidth);
          return;
        }

        const syncedWidth = clampSidebarWidth(sidebarWidth, maxSidebarWidth);
        draftSidebarWidthRef.current = syncedWidth;
        setDraftSidebarWidth(syncedWidth);
      };

      const handlePointerUp = () => {
        finishDrag(true);
      };

      const handlePointerCancel = () => {
        finishDrag(false);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerCancel);
    },
    [maxSidebarWidth, setClampedSidebarWidth, setSidebarWidth, sidebarWidth],
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-transparent text-text-primary">
      <div
        data-tauri-drag-region
        className="absolute inset-x-0 top-0 z-30"
        style={{ height: "var(--chrome-drag-height)" }}
      />
      <div
        className="pointer-events-auto absolute left-0 top-0 z-50 flex items-center"
        style={{
          height: "calc(var(--chrome-control-height) + var(--chrome-control-padding) * 2)",
          padding: "var(--chrome-control-padding) 12px var(--chrome-control-padding) 92px",
        }}
      >
        <SidebarToggleButton onWallpaper={isEmptyWorkspace && isSidebarCollapsed} />
      </div>
      {isEmptyWorkspace && <EmptyStateActions />}
      {!isEmptyWorkspace && (
        <div
          className="pointer-events-none absolute top-0 z-40"
          style={{
            left: tabChromeLeft,
            right: 12,
            transition: isSidebarDragging ? "none" : "left 140ms ease-out",
          }}
        >
          <div className="pointer-events-auto">
            <EditorTabs />
          </div>
        </div>
      )}
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex min-h-0 flex-1">
          <div
            className="shrink-0 overflow-hidden"
            style={{
              width: isSidebarCollapsed ? 0 : draftSidebarWidth,
              transition: isSidebarDragging ? "none" : "width 140ms ease-out",
            }}
          >
            <div style={{ width: draftSidebarWidth }} className="h-full">
              <Sidebar />
            </div>
          </div>
          {!isSidebarCollapsed && (
            <div
              role="presentation"
              aria-hidden="true"
              data-dragging={isSidebarDragging || undefined}
              onPointerDown={handleSidebarResizeStart}
              className="relative w-0 shrink-0 cursor-col-resize before:absolute before:inset-y-0 before:-left-1 before:w-2 before:content-[''] after:pointer-events-none after:absolute after:inset-y-0 after:left-0 after:w-px after:bg-transparent after:transition-colors after:content-[''] hover:after:bg-[var(--line-subtle)] data-[dragging]:after:bg-[var(--border-color)]"
            />
          )}

          <div className="relative min-w-0 flex-1 bg-bg">
            <EditorArea />
          </div>
        </div>
      </div>
    </div>
  );
}
