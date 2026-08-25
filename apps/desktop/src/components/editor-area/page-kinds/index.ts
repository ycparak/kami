import { fileKind, type FileLocation } from "./file";
import { launcherKind, type LauncherLocation } from "./launcher";
import { settingsKind, type SettingsLocation } from "./settings";
import type { AnyPageKind, PageKind, SerializedLocation } from "./types";

const kinds = [fileKind, launcherKind, settingsKind] as const;

export type Location = FileLocation | LauncherLocation | SettingsLocation;

const byKind: Map<string, AnyPageKind> = new Map(
  kinds.map((k) => [k.kind, k as unknown as AnyPageKind]),
);

export function pageKind<L extends Location>(location: L): PageKind<L["kind"], L> {
  const k = byKind.get(location.kind);
  if (!k) throw new Error(`Unknown page kind: ${location.kind}`);
  return k as unknown as PageKind<L["kind"], L>;
}

export const locationBehavior = pageKind;

export function serializeLocation(location: Location): SerializedLocation | null {
  const payload = pageKind(location).serialize(location);
  if (payload === null) return null;
  return { kind: location.kind, ...payload };
}

export function deserializeLocation(data: SerializedLocation | null | undefined): Location | null {
  if (!data) return null;
  const k = byKind.get(data.kind);
  if (!k) return null;
  return k.fromPayload(data) as Location | null;
}

export type { PageKind, SerializedLocation, AnyPageKind } from "./types";
export type { FileLocation } from "./file";
export type { LauncherLocation } from "./launcher";
export type { SettingsLocation } from "./settings";
