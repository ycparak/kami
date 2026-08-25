import { useEditorStore, type Tab } from "@/stores/editor-store";
import { useWorkspaceChromeMode } from "@/hooks/use-workspace";

function isLauncherOnly(tabs: Tab[]) {
  return tabs.length === 1 && tabs[0]?.location.kind === "launcher";
}

export function isEmptyWorkspace(tabs: Tab[], isCompactFileMode: boolean) {
  return !isCompactFileMode && isLauncherOnly(tabs);
}

export function useIsEmptyWorkspace() {
  const launcherOnly = useEditorStore((s) => isLauncherOnly(s.tabs));
  const chromeMode = useWorkspaceChromeMode();
  return launcherOnly && chromeMode !== "compact-file";
}
