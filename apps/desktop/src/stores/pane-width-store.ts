import { create } from "zustand";

interface PaneWidthState {
  overrides: Record<string, number>;
  setOverride: (tabId: string, widthPx: number) => void;
  clearOverride: (tabId: string) => void;
}

export const usePaneWidthStore = create<PaneWidthState>((set) => ({
  overrides: {},

  setOverride: (tabId, widthPx) =>
    set((state) => ({ overrides: { ...state.overrides, [tabId]: widthPx } })),

  clearOverride: (tabId) =>
    set((state) => {
      if (!(tabId in state.overrides)) return state;
      const overrides = { ...state.overrides };
      delete overrides[tabId];
      return { overrides };
    }),
}));
