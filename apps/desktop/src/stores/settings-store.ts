import { create } from "zustand";
import * as tauri from "@/lib/tauri";
import { applyCssVarBindings, applyTheme } from "@/lib/theme";
import type { SettingsMap, SettingKey } from "@/lib/settings-schema";

interface SettingsState {
  settings: Record<string, unknown>;
  isLoaded: boolean;

  loadSettings: () => Promise<void>;
  getSetting: <K extends SettingKey>(key: K) => SettingsMap[K] | undefined;
  setSetting: (key: string, value: unknown, scope?: "global" | "workspace") => Promise<void>;
  resetSetting: (key: string, scope?: "global" | "workspace") => Promise<void>;
  hydrateFromBackend: (payload: { settings: Record<string, unknown> }) => void;
}

function applySettingsSideEffects(settings: Record<string, unknown>) {
  applyTheme(settings["appearance.theme"], settings);
  applyCssVarBindings(settings);
}

interface PersistedSettingValue {
  exists: boolean;
  value: unknown;
}

interface SettingWriteQueue {
  tail: Promise<void>;
  latestVersion: number;
  lastPersisted: PersistedSettingValue;
}

const settingWriteQueues = new Map<string, SettingWriteQueue>();

function getWriteQueue(key: string, settings: Record<string, unknown>): SettingWriteQueue {
  const existing = settingWriteQueues.get(key);
  if (existing) return existing;
  const queue: SettingWriteQueue = {
    tail: Promise.resolve(),
    latestVersion: 0,
    lastPersisted: {
      exists: Object.prototype.hasOwnProperty.call(settings, key),
      value: settings[key],
    },
  };
  settingWriteQueues.set(key, queue);
  return queue;
}

function persistedValueFor(key: string, settings: Record<string, unknown>): PersistedSettingValue {
  return {
    exists: Object.prototype.hasOwnProperty.call(settings, key),
    value: settings[key],
  };
}

function replaceSettingValue(
  settings: Record<string, unknown>,
  key: string,
  persisted: PersistedSettingValue,
): Record<string, unknown> {
  const nextSettings = { ...settings };
  if (persisted.exists) nextSettings[key] = persisted.value;
  else delete nextSettings[key];
  return nextSettings;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {},
  isLoaded: false,

  loadSettings: async () => {
    const settings = await tauri.getSettings();
    set({ settings, isLoaded: true });
    applySettingsSideEffects(settings);
  },

  getSetting: <K extends SettingKey>(key: K): SettingsMap[K] | undefined => {
    return get().settings[key as string] as SettingsMap[K] | undefined;
  },

  setSetting: async (key: string, value: unknown, scope: "global" | "workspace" = "global") => {
    const queue = getWriteQueue(key, get().settings);
    const version = ++queue.latestVersion;

    set((state) => ({
      settings: { ...state.settings, [key]: value },
    }));
    applySettingsSideEffects(get().settings);

    const write = queue.tail.catch(() => {}).then(() => tauri.setSetting(key, value, scope));
    queue.tail = write;

    try {
      await write;
      queue.lastPersisted = { exists: true, value };
    } catch (error) {
      if (queue.latestVersion === version) {
        set((state) => ({
          settings: replaceSettingValue(state.settings, key, queue.lastPersisted),
        }));
        applySettingsSideEffects(get().settings);
      }
      throw error;
    } finally {
      if (queue.tail === write) settingWriteQueues.delete(key);
    }
  },

  resetSetting: async (key: string, scope: "global" | "workspace" = "global") => {
    const queue = getWriteQueue(key, get().settings);
    const version = ++queue.latestVersion;
    let resetValue = queue.lastPersisted;

    const write = queue.tail
      .catch(() => {})
      .then(async () => {
        await tauri.resetSetting(key, scope);
        resetValue = persistedValueFor(key, await tauri.getSettings());
      });
    queue.tail = write;

    try {
      await write;
      queue.lastPersisted = resetValue;
      if (queue.latestVersion === version) {
        set((state) => ({
          settings: replaceSettingValue(state.settings, key, resetValue),
        }));
        applySettingsSideEffects(get().settings);
      }
    } catch (error) {
      if (queue.latestVersion === version) {
        set((state) => ({
          settings: replaceSettingValue(state.settings, key, queue.lastPersisted),
        }));
        applySettingsSideEffects(get().settings);
      }
      throw error;
    } finally {
      if (queue.tail === write) settingWriteQueues.delete(key);
    }
  },

  hydrateFromBackend: ({ settings }) => {
    set({ settings, isLoaded: true });
    applySettingsSideEffects(settings);
  },
}));
