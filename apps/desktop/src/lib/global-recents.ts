import { useEditorStore } from "@/stores/editor-store";
import * as tauri from "@/lib/tauri";

export function recordRecentFile(path: string) {
  tauri.recordRecentFile(path).catch((error) => {
    console.error("Failed to record recent file", error);
  });
}

if (typeof window !== "undefined") {
  useEditorStore.subscribe((state, prev) => {
    if (state.activeFilePath === prev.activeFilePath) return;
    if (!state.activeFilePath) return;
    recordRecentFile(state.activeFilePath);
  });
}
