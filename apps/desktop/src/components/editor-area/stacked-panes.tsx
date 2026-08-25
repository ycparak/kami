import { useActiveTabId, useOpenTabs } from "@/hooks/use-tabs";
import { pageKind } from "./page-kinds";
import { PaneFrame } from "./pane-frame";

const ACTIVE_PANE = "relative z-10 h-full";
const INACTIVE_PANE = "absolute inset-0 h-full invisible pointer-events-none";

export function StackedPanes({ showFooter }: { showFooter: boolean }) {
  const tabs = useOpenTabs();
  const activeTabId = useActiveTabId();

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        if (!pageKind(tab.location).keepAlive && !isActive) return null;

        return (
          <PaneFrame
            key={tab.id}
            tab={tab}
            isActive={isActive}
            showFooter={showFooter}
            className={isActive ? ACTIVE_PANE : INACTIVE_PANE}
            isHidden={!isActive}
          />
        );
      })}
    </div>
  );
}
