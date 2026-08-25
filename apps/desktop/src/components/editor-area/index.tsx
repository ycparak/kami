import { StackedPanes } from "./stacked-panes";
import { ColumnPanes } from "./column-panes";
import { AnchorWarningBanner } from "./anchor-warning-banner";
import { useLayoutMode, type LayoutMode } from "@/hooks/use-pane-layout";

interface EditorAreaProps {
  showFooter?: boolean;
  layout?: LayoutMode;
}

function EditorArea({ showFooter = true, layout }: EditorAreaProps) {
  const settingLayout = useLayoutMode();
  const Panes = (layout ?? settingLayout) === "columns" ? ColumnPanes : StackedPanes;

  return (
    <div className="relative h-full overflow-hidden">
      <Panes showFooter={showFooter} />
      <AnchorWarningBanner />
    </div>
  );
}

export { EditorArea };
