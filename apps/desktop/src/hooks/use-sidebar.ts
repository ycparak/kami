import { useSettingsStore } from "@/stores/settings-store";

export function toggleSidebar() {
  const isVisible = useSettingsStore.getState().settings["appearance.sidebar-visible"] !== false;
  void useSettingsStore.getState().setSetting("appearance.sidebar-visible", !isVisible);
}

export function useSidebar() {
  const isSidebarVisible = useSettingsStore(
    (state) => (state.settings["appearance.sidebar-visible"] as boolean | undefined) ?? true,
  );
  const sidebarWidth =
    useSettingsStore((state) => state.settings["appearance.sidebar-width"] as number | undefined) ??
    240;
  const setSetting = useSettingsStore((state) => state.setSetting);

  return {
    isSidebarCollapsed: !isSidebarVisible,
    isSidebarVisible,
    sidebarWidth,
    setSidebarWidth: (width: number) => setSetting("appearance.sidebar-width", width),
    toggleSidebar,
  };
}
