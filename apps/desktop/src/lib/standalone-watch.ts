import { useEditorStore } from "@/stores/editor-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import * as tauri from "@/lib/tauri";

useEditorStore.subscribe((state, prev) => {
  if (state.activeFilePath === prev.activeFilePath) return;
  if (!state.activeFilePath) return;

  const { root, chromeMode } = useWorkspaceStore.getState();
  if (root !== null || chromeMode !== "compact-file") return;

  tauri.watchStandaloneFile(state.activeFilePath).catch((error) => {
    console.error("Failed to watch standalone file", error);
  });
});
