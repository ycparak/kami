import schemaFile from "@shared/settings.schema.json";

type RawSchema = typeof schemaFile;

type RawEntry = RawSchema["settings"][number];

type ValueOf<T extends RawEntry> = T["type"] extends "boolean"
  ? boolean
  : T["type"] extends "number" | "range"
    ? number
    : T["type"] extends "list"
      ? string[]
      : string;

export type SettingsMap = {
  [E in RawEntry as E["key"]]: ValueOf<E>;
};

export type SettingKey = keyof SettingsMap;

export interface SettingDef {
  key: string;
  label: string;
  description: string;
  category: string;
  type: "string" | "number" | "boolean" | "enum" | "list" | "color" | "range" | "font";
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  cssVar?: string;
  cssFormat?: "px" | "raw";
  default: unknown;
}

export const SETTINGS_SCHEMA: SettingDef[] = schemaFile.settings as SettingDef[];

export type ThemeMode = "light" | "dark";

export type PrimarySuffix = "accent" | "background" | "foreground" | "translucent" | "contrast";

const PRIMARY_PREFIX = (mode: ThemeMode) => `theme.${mode}.`;

function presetKey(mode: ThemeMode): string {
  return `theme.${mode}.preset`;
}

export function getPrimaryDefs(mode: ThemeMode): SettingDef[] {
  const prefix = PRIMARY_PREFIX(mode);
  const presetK = presetKey(mode);
  return SETTINGS_SCHEMA.filter((def) => def.key.startsWith(prefix) && def.key !== presetK);
}

export function suffixOf(mode: ThemeMode, key: string): PrimarySuffix {
  return key.slice(PRIMARY_PREFIX(mode).length) as PrimarySuffix;
}
