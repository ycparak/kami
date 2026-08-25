import { useSettingsStore } from "@/stores/settings-store";
import { usePaneWidthStore } from "@/stores/pane-width-store";

export type LayoutMode = "columns" | "tabs";

const DEFAULT_LAYOUT_MODE: LayoutMode = "columns";
const DEFAULT_PANE_WIDTH = 720;

function readLayoutMode(settings: Record<string, unknown>): LayoutMode {
  const value = settings["appearance.column-layout"];
  if (typeof value !== "boolean") return DEFAULT_LAYOUT_MODE;
  return value ? "columns" : "tabs";
}

function readPaneWidth(settings: Record<string, unknown>): number {
  const value = settings["appearance.pane-width"];
  return typeof value === "number" && value > 0 ? value : DEFAULT_PANE_WIDTH;
}

export function useLayoutMode(): LayoutMode {
  return useSettingsStore((state) => readLayoutMode(state.settings));
}

export function usePaneWidth(): number {
  return useSettingsStore((state) => readPaneWidth(state.settings));
}

export function getLayoutMode(): LayoutMode {
  return readLayoutMode(useSettingsStore.getState().settings);
}

export function usePaneWidthOverrides(): Record<string, number> {
  return usePaneWidthStore((state) => state.overrides);
}

export function useSetPaneWidthOverride() {
  return usePaneWidthStore((state) => state.setOverride);
}

export function useClearPaneWidthOverride() {
  return usePaneWidthStore((state) => state.clearOverride);
}
