import type { CSSProperties } from "react";
import { useActiveTabId, useOpenTabs } from "@/hooks/use-tabs";
import { usePaneWidth, usePaneWidthOverrides } from "@/hooks/use-pane-layout";
import { PaneFrame, TAB_STRIP_HEIGHT } from "./pane-frame";
import { useScrollFocusedPaneIntoView } from "./use-scroll-focused-pane-into-view";
import { usePaneStacking } from "./use-pane-stacking";
import { usePaneResize } from "./use-pane-resize";

const PANE = "relative h-full shrink-0 bg-surface-primary";

const CONTENT_GAP_BELOW_TABS = 88;

const SCROLL_CONTAINER_BORDER = 12;
const FRONTMATTER_WRAPPER_BOTTOM_PAD = 24;

const EDITOR_TOP_PAD = `calc(${TAB_STRIP_HEIGHT} + ${
  CONTENT_GAP_BELOW_TABS - SCROLL_CONTAINER_BORDER - FRONTMATTER_WRAPPER_BOTTOM_PAD
}px)`;

const ROW_STYLE = { "--kami-editor-top-pad": EDITOR_TOP_PAD } as CSSProperties;

function autoPaneWidthStyle(minWidth: number, reservedPx: number, autoCount: number) {
  return `min(100%, max(${minWidth}px, calc((100% - ${reservedPx}px) / ${autoCount})))`;
}

export function ColumnPanes({ showFooter }: { showFooter: boolean }) {
  const tabs = useOpenTabs();
  const activeTabId = useActiveTabId();
  const minPaneWidth = usePaneWidth();
  const overrides = usePaneWidthOverrides();
  const { rowRef, recomputeStacking } = usePaneStacking(tabs.length);
  const { draggingTabId, startResize, resetResize } = usePaneResize(
    minPaneWidth,
    recomputeStacking,
  );
  useScrollFocusedPaneIntoView();

  const reservedPx = tabs.reduce((sum, tab) => sum + (overrides[tab.id] ?? 0), 0);
  const autoCount = tabs.length - tabs.filter((tab) => overrides[tab.id] !== undefined).length;
  const autoWidth = autoPaneWidthStyle(minPaneWidth, reservedPx, Math.max(1, autoCount));

  return (
    <div
      data-pane-row
      ref={rowRef}
      style={ROW_STYLE}
      className="relative flex h-full min-h-0 overflow-x-auto overflow-y-hidden scrollbar-none [overscroll-behavior-x:contain]"
    >
      {tabs.map((tab, index) => {
        const override = overrides[tab.id];
        const style: CSSProperties = {
          width: override !== undefined ? `${override}px` : autoWidth,
          position: "sticky",
          left: 0,
          zIndex: index,
        };
        const previousTab = tabs[index - 1];

        return (
          <PaneFrame
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            showFooter={showFooter}
            className={PANE}
            style={style}
            showDivider={index > 0}
            stackable
            onResizeStart={previousTab ? startResize(previousTab.id) : undefined}
            onResizeReset={previousTab ? resetResize(previousTab.id) : undefined}
            isResizeDragging={previousTab ? draggingTabId === previousTab.id : false}
          />
        );
      })}
    </div>
  );
}
