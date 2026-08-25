import { useSettingsStore } from "@/stores/settings-store";
import type { ThemePreference } from "@/lib/theme";

export function toggleTheme() {
  const current =
    (useSettingsStore.getState().settings["appearance.theme"] as ThemePreference) ?? "system";
  const next: ThemePreference =
    current === "system" ? "light" : current === "light" ? "dark" : "system";
  void useSettingsStore.getState().setSetting("appearance.theme", next);
}

export function useTheme() {
  const themePreference =
    useSettingsStore(
      (state) => state.settings["appearance.theme"] as ThemePreference | undefined,
    ) ?? "system";
  return { themePreference, toggleTheme };
}
