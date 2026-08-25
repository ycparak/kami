import type { DirEntry } from "@/types/fs";

export interface FlatTreeItem {
  entry: DirEntry;
  depth: number;
}

export function flattenTree(
  items: DirEntry[],
  depth: number,
  directoryCache: Map<string, DirEntry[]>,
  expandedDirs: Set<string>,
  result: FlatTreeItem[] = [],
): FlatTreeItem[] {
  for (const entry of items) {
    result.push({ entry, depth });
    if (entry.is_dir && expandedDirs.has(entry.path)) {
      flattenTree(
        directoryCache.get(entry.path) ?? [],
        depth + 1,
        directoryCache,
        expandedDirs,
        result,
      );
    }
  }
  return result;
}
