import {
  getPrimaryDefs,
  SETTINGS_SCHEMA,
  suffixOf,
  type PrimarySuffix,
  type SettingDef,
  type ThemeMode,
} from "./settings-schema";

export type ThemePreference = "system" | "light" | "dark";

let systemThemeCleanup: (() => void) | null = null;
let lastSettings: Record<string, unknown> = {};

function setThemeAttribute(isDark: boolean) {
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
}

const DERIVED_PRIMARIES: Partial<Record<PrimarySuffix, (v: unknown) => [string, string]>> = {
  translucent: (v) => {
    const t = clamp(Number(v) || 0, 0, 100);
    return ["--bg-opacity", String(1 - (t / 100) * 0.95)];
  },
  contrast: (v) => {
    const c = clamp(Number(v) || 0, 0, 100);
    return ["--contrast", String(0.2 + (c / 100) * 0.8)];
  },
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatCssValue(value: unknown, format: SettingDef["cssFormat"]): string | null {
  let str: string;
  if (typeof value === "string") str = value;
  else if (typeof value === "number") str = value.toString();
  else return null;
  return format === "px" ? `${str}px` : str;
}

function applyPrimaries(mode: ThemeMode, settings: Record<string, unknown>) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const def of getPrimaryDefs(mode)) {
    const value = settings[def.key];
    if (value === undefined || value === null) continue;
    const derive = DERIVED_PRIMARIES[suffixOf(mode, def.key)];
    if (derive) {
      const [varName, formatted] = derive(value);
      root.style.setProperty(varName, formatted);
    } else if (def.cssVar) {
      const formatted = formatCssValue(value, def.cssFormat);
      if (formatted !== null) root.style.setProperty(def.cssVar, formatted);
    }
  }
}

export function applyCssVarBindings(settings: Record<string, unknown>) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const def of SETTINGS_SCHEMA) {
    if (!def.cssVar) continue;
    if (def.key.startsWith("theme.")) continue;
    const value = settings[def.key];
    if (value === undefined || value === null) continue;
    const formatted = formatCssValue(value, def.cssFormat);
    if (formatted !== null) root.style.setProperty(def.cssVar, formatted);
  }
}

function pushForMode(mode: ThemeMode, settings: Record<string, unknown>) {
  setThemeAttribute(mode === "dark");
  applyPrimaries(mode, settings);
}

export function applyTheme(preference: unknown, settings: Record<string, unknown>) {
  if (typeof document === "undefined") return;

  lastSettings = settings;

  if (systemThemeCleanup) {
    systemThemeCleanup();
    systemThemeCleanup = null;
  }

  const pref: ThemePreference =
    preference === "dark" || preference === "light" || preference === "system"
      ? preference
      : "system";

  if (pref !== "system") {
    pushForMode(pref, settings);
    return;
  }

  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  pushForMode(mq.matches ? "dark" : "light", settings);

  const handler = (e: MediaQueryListEvent) => {
    pushForMode(e.matches ? "dark" : "light", lastSettings);
  };
  mq.addEventListener("change", handler);
  systemThemeCleanup = () => mq.removeEventListener("change", handler);
}
