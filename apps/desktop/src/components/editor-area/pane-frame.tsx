import type { ComponentType, CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useSetActiveTab, type Tab } from "@/hooks/use-tabs";
import { pageKindView } from "./page-kinds/views";
import { EditorSearchOverlay } from "./editor-search-overlay";

export const TAB_STRIP_HEIGHT =
  "calc(var(--chrome-control-height) + var(--chrome-control-padding) * 2)";
const DIVIDER_FADE_DISTANCE = "32px";

interface PaneFrameProps {
  tab: Tab;
  isActive: boolean;
  showFooter: boolean;
  className: string;
  style?: CSSProperties;
  isHidden?: boolean;
  showDivider?: boolean;
  stackable?: boolean;
  onResizeStart?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeReset?: () => void;
  isResizeDragging?: boolean;
}

export function PaneFrame({
  tab,
  isActive,
  showFooter,
  className,
  style,
  isHidden,
  showDivider,
  stackable,
  onResizeStart,
  onResizeReset,
  isResizeDragging,
}: PaneFrameProps) {
  const view = pageKindView(tab.location);
  const setActiveTab = useSetActiveTab();
  const Component = view.Component as ComponentType<{
    location: typeof tab.location;
    isActive: boolean;
    tabId: string;
  }>;

  const focusPane = () => setActiveTab(tab.id);

  const dividerMask = `linear-gradient(to bottom, transparent, black ${DIVIDER_FADE_DISTANCE})`;

  return (
    <div
      data-pane
      data-pane-id={tab.id}
      data-collapsed={stackable ? "false" : undefined}
      className={className}
      style={style}
      aria-hidden={isHidden || undefined}
      onPointerDown={focusPane}
      onFocusCapture={focusPane}
    >
      {showDivider ? (
        <div
          aria-hidden={!onResizeStart}
          role={onResizeStart ? "separator" : undefined}
          aria-orientation={onResizeStart ? "vertical" : undefined}
          data-pane-divider
          data-dragging={isResizeDragging || undefined}
          onPointerDown={onResizeStart}
          onDoubleClick={onResizeReset}
          className={`absolute left-0 w-px bg-[var(--line-subtle)] transition-colors ${
            onResizeStart
              ? "pointer-events-auto cursor-col-resize before:absolute before:inset-y-0 before:-left-1 before:w-2 before:content-[''] hover:bg-[var(--border-color)] data-[dragging]:bg-[var(--border-color)]"
              : "pointer-events-none"
          }`}
          style={{
            top: TAB_STRIP_HEIGHT,
            bottom: 0,
            maskImage: dividerMask,
            WebkitMaskImage: dividerMask,
          }}
        />
      ) : null}
      <Component location={tab.location} isActive={isActive} tabId={tab.id} />
      {showFooter ? view.renderFooter?.(tab.location) : null}
      {isActive ? <EditorSearchOverlay /> : null}
    </div>
  );
}
