import { parse, stringify } from "yaml";

export interface YamlEntry {
  id: string;
  key: string;
  value: string;
  isComplex: boolean;
}

let nextEntryId = 0;
export function makeEntryId(): string {
  return `fm-${nextEntryId++}`;
}

export function parseYamlEntries(yamlString: string): YamlEntry[] {
  if (!yamlString.trim()) return [];

  let parsed: unknown;
  try {
    parsed = parse(yamlString);
  } catch {
    return [{ id: makeEntryId(), key: "", value: yamlString, isComplex: false }];
  }

  if (
    parsed === null ||
    parsed === undefined ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    return [];
  }

  const obj = parsed as Record<string, unknown>;
  return Object.entries(obj).map(([key, value]) => {
    if (value === null || value === undefined) {
      return { id: makeEntryId(), key, value: "", isComplex: false };
    }
    if (typeof value === "object") {
      return { id: makeEntryId(), key, value: stringify(value).trim(), isComplex: true };
    }
    return {
      id: makeEntryId(),
      key,
      value: String(value as string | number | boolean),
      isComplex: false,
    };
  });
}

export function serializeYamlEntries(entries: YamlEntry[]): string {
  const filtered = entries.filter((e) => e.key.trim() !== "");
  if (filtered.length === 0) return "";

  const obj: Record<string, unknown> = {};
  for (const entry of filtered) {
    if (entry.isComplex) {
      try {
        obj[entry.key] = parse(entry.value);
      } catch {
        obj[entry.key] = entry.value;
      }
    } else {
      obj[entry.key] = coerceScalar(entry.value);
    }
  }

  return stringify(obj, { lineWidth: 0 }).trim();
}

function coerceScalar(value: string): unknown {
  if (value === "") return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  const num = Number(value);
  if (!Number.isNaN(num) && value.trim() !== "") return num;
  return value;
}
