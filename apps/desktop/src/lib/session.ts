import * as tauri from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settings-store";
import type { SessionTabData } from "@/lib/tauri";

interface Session {
  tabs: SessionTabData[];
  activeIndex: number | null;
}

export async function saveSession(
  workspaceRoot: string,
  tabs: SessionTabData[],
  activeIndex: number | null,
): Promise<void> {
  const settings = useSettingsStore.getState().settings;
  if (!settings["workspace.restore-open-files"]) return;

  try {
    await tauri.saveSession(workspaceRoot, tabs, activeIndex);
  } catch {}
}

export async function loadSession(workspaceRoot: string): Promise<Session | null> {
  const settings = useSettingsStore.getState().settings;
  if (!settings["workspace.restore-open-files"]) return null;

  try {
    const data = await tauri.loadSession(workspaceRoot);
    if (!data || !data.tabs) return null;
    return {
      tabs: data.tabs,
      activeIndex: data.active_index ?? null,
    };
  } catch {
    return null;
  }
}
