import { load } from "@tauri-apps/plugin-store";

let storePromise: ReturnType<typeof load> | null = null;

function getStore() {
  if (!storePromise) {
    storePromise = load("preferences.json", {
      defaults: {},
      autoSave: true,
    });
  }
  return storePromise;
}

export async function getPreference<T>(key: string, fallback: T): Promise<T> {
  try {
    const store = await getStore();
    const value = await store.get<T>(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function setPreference<T>(key: string, value: T): Promise<void> {
  try {
    const store = await getStore();
    await store.set(key, value);
  } catch {}
}
