import { useEffect } from "react";
import { useUIStore } from "@/stores/ui-store";
import { useEditorStore } from "@/stores/editor-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { toggleSidebar } from "@/hooks/use-sidebar";
import { isEmptyWorkspace } from "@/hooks/use-empty-workspace";
import { getWorkspaceChromeMode } from "@/lib/compact-mode";

function isEditableTargetFocused(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return true;
  if ((active as HTMLElement).isContentEditable) return true;
  return active.closest(".cm-editor") !== null;
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;

      const { openCommandPalette } = useUIStore.getState();
      const { root, chromeMode } = useWorkspaceStore.getState();
      const {
        tabs,
        activeTabId,
        setActiveTab,
        openNewTab,
        closeActiveTab,
        navigateBack,
        navigateForward,
      } = useEditorStore.getState();
      const isCompactFileMode = getWorkspaceChromeMode(root, chromeMode) === "compact-file";

      if (e.altKey && !e.shiftKey && e.key === "ArrowLeft" && !isEditableTargetFocused()) {
        e.preventDefault();
        void navigateBack();
        return;
      }

      if (e.altKey && !e.shiftKey && e.key === "ArrowRight" && !isEditableTargetFocused()) {
        e.preventDefault();
        void navigateForward();
        return;
      }

      if (mod && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        if (e.shiftKey || root) openCommandPalette("search");
        return;
      }

      if (mod && e.key === "w") {
        if (isCompactFileMode) return;
        e.preventDefault();
        if (activeTabId) closeActiveTab();
        return;
      }

      if (mod && e.key === "\\") {
        e.preventDefault();
        if (isCompactFileMode) return;
        toggleSidebar();
        return;
      }

      if (mod && e.key === "n") {
        e.preventDefault();
        if (root) openCommandPalette("create-file");
        return;
      }

      if (mod && e.key === "o") {
        e.preventDefault();
        if (root) openCommandPalette("search");
        return;
      }

      if (mod && e.key === "t") {
        e.preventDefault();
        if (isCompactFileMode) return;
        if (isEmptyWorkspace(tabs, isCompactFileMode)) return;
        if (root) openNewTab();
        return;
      }

      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        if (isCompactFileMode) return;
        if (tabs.length === 0 || !activeTabId) return;
        const idx = tabs.findIndex((tab) => tab.id === activeTabId);
        if (idx === -1) return;
        const next = e.shiftKey ? (idx - 1 + tabs.length) % tabs.length : (idx + 1) % tabs.length;
        setActiveTab(tabs[next]!.id);
        return;
      }

      if (mod && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        if (isCompactFileMode) return;
        const n = parseInt(e.key) - 1;
        if (n < tabs.length) {
          setActiveTab(tabs[n]!.id);
        }
        return;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
