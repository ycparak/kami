import { createSettingsTab, useEditorStore } from "@/stores/editor-store";
import type { DocumentStats } from "@/lib/document-stats";

export type { OpenFile, Tab, Location, FileLocation, SessionTab } from "@/stores/editor-store";

const EMPTY_STATS: DocumentStats = { words: 0, characters: 0, paragraphs: 0 };

export function useOpenTabs() {
  return useEditorStore((s) => s.tabs);
}

export function useOpenFiles() {
  return useEditorStore((s) => s.openFiles);
}

export function useActiveTabId() {
  return useEditorStore((s) => s.activeTabId);
}

export function useActiveTab() {
  return useEditorStore((s) => s.tabs.find((tab) => tab.id === s.activeTabId) ?? null);
}

export function useActiveFilePath() {
  return useEditorStore((s) => s.activeFilePath);
}

export function useResolvedDocumentTitle(path: string | null) {
  return useEditorStore((s) => (path ? s.openFiles.get(path)?.title : undefined) ?? "");
}

export function useFileContent(path: string | null) {
  return useEditorStore((s) => (path ? s.openFiles.get(path)?.content : undefined) ?? "");
}

export function useFileStats(path: string | null) {
  return useEditorStore((s) => (path ? s.openFiles.get(path)?.stats : undefined) ?? EMPTY_STATS);
}

export function useOpenFile() {
  return useEditorStore((s) => s.openFile);
}

export function useOpenNewTab() {
  return useEditorStore((s) => s.openNewTab);
}

export function useOpenFileInNewTab() {
  return useEditorStore((s) => s.openFileInNewTab);
}

export function useNavigateToFile() {
  return useEditorStore((s) => s.navigateToFile);
}

export function useCloseTab() {
  return useEditorStore((s) => s.closeTab);
}

export function useCloseActiveTab() {
  return useEditorStore((s) => s.closeActiveTab);
}

export function useSetActiveTab() {
  return useEditorStore((s) => s.setActiveTab);
}

export function useNavigateBack() {
  return useEditorStore((s) => s.navigateBack);
}

export function useNavigateForward() {
  return useEditorStore((s) => s.navigateForward);
}

export function useCanNavigateBack() {
  return useEditorStore((s) => {
    const activeTab = s.tabs.find((tab) => tab.id === s.activeTabId);
    return activeTab ? activeTab.back.length > 0 : false;
  });
}

export function useCanNavigateForward() {
  return useEditorStore((s) => {
    const activeTab = s.tabs.find((tab) => tab.id === s.activeTabId);
    return activeTab ? activeTab.forward.length > 0 : false;
  });
}

export function useIsFileLoading(path: string) {
  return useEditorStore((s) => s.openFiles.get(path)?.isLoading ?? false);
}

export function useFileSaveError(path: string | null) {
  return useEditorStore((s) => (path ? s.openFiles.get(path)?.saveError : null) ?? null);
}

export function useIsActive(path: string) {
  return useEditorStore((s) => s.activeFilePath === path);
}

export function useReloadVersion(path: string | null) {
  return useEditorStore((s) => (path ? (s.openFiles.get(path)?.reloadVersion ?? 0) : 0));
}

function useOpenOrFocus() {
  return useEditorStore((s) => s.openOrFocus);
}

export function useOpenSettingsTab() {
  const openOrFocus = useOpenOrFocus();
  return () => openOrFocus((tab) => tab.location.kind === "settings", createSettingsTab);
}
