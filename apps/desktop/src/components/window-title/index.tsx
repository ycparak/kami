import { useActiveFilePath, useActiveTab, useOpenFiles } from "@/hooks/use-tabs";
import { pageKind } from "@/components/editor-area/page-kinds";
import { getFileName } from "@/lib/paths";
import { useWindowTitle } from "./use-window-title";

export function WindowTitle() {
  const activeTab = useActiveTab();
  const activeFilePath = useActiveFilePath();
  const openFiles = useOpenFiles();

  const title = (() => {
    if (!activeTab) return "Kami";
    if (!activeFilePath) {
      const label = pageKind(activeTab.location).title(activeTab.location);
      return `${label} - Kami`;
    }
    const file = openFiles.get(activeFilePath);
    const name = getFileName(activeFilePath);
    return file?.isDirty ? `${name} (unsaved) - Kami` : `${name} - Kami`;
  })();

  useWindowTitle(title);

  return null;
}
