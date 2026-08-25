import { useSettingsStore } from "@/stores/settings-store";
import type { SettingsMap, SettingKey } from "@/lib/settings-schema";

export type { SettingsMap, SettingKey };

export function useSetting<K extends SettingKey>(key: K): SettingsMap[K] | undefined {
  return useSettingsStore((state) => state.settings[key as string]) as SettingsMap[K] | undefined;
}

export function useBooleanSetting(key: SettingKey, fallback = true): boolean {
  const value = useSettingsStore((state) => state.settings[key as string]);
  return typeof value === "boolean" ? value : fallback;
}

export function useSetSetting() {
  return useSettingsStore((state) => state.setSetting);
}

export function useResetSetting() {
  return useSettingsStore((state) => state.resetSetting);
}

export function useAllSettings() {
  return useSettingsStore((state) => state.settings);
}
