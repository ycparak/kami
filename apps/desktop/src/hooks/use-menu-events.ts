import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { createSettingsTab, useEditorStore } from "@/stores/editor-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { getWorkspaceChromeMode } from "@/lib/compact-mode";

export const MENU_EVENT_HANDLERS: Record<string, () => void> = {
  "menu:open-preferences": openPreferences,
};

function openPreferences() {
  const { root, chromeMode } = useWorkspaceStore.getState();
  if (getWorkspaceChromeMode(root, chromeMode) === "compact-file") return;

  useEditorStore
    .getState()
    .openOrFocus((tab) => tab.location.kind === "settings", createSettingsTab);
}

export function useMenuEvents() {
  useEffect(() => {
    const unlistens = Object.entries(MENU_EVENT_HANDLERS).map(([event, handler]) =>
      listen(event, handler),
    );
    return () => {
      for (const p of unlistens) {
        void p.then((fn) => fn());
      }
    };
  }, []);
}
