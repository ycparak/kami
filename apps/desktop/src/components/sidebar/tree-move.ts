import { getParentDir } from "@/lib/paths";
import type { DirEntry } from "@/types/fs";

export function resolveDropDir(target: DirEntry | null, rootPath: string): string {
  if (!target) return rootPath;
  return target.is_dir ? target.path : getParentDir(target.path);
}

export function canMoveInto(sourcePath: string, sourceIsDir: boolean, destDir: string): boolean {
  if (getParentDir(sourcePath) === destDir) return false;
  if (sourceIsDir) {
    if (destDir === sourcePath) return false;
    if (destDir.startsWith(`${sourcePath}/`)) return false;
  }
  return true;
}

export function computeMovePath(entry: DirEntry, destDir: string): string {
  return `${destDir}/${entry.name}`;
}

export function resolveDropRange(
  rows: ReadonlyArray<{ path: string; depth: number }>,
  destDir: string,
  rootPath: string,
): { startPath: string; endPath: string } | null {
  if (rows.length === 0) return null;
  if (destDir === rootPath) {
    return { startPath: rows[0].path, endPath: rows[rows.length - 1].path };
  }
  const startIndex = rows.findIndex((row) => row.path === destDir);
  if (startIndex === -1) return null;
  const baseDepth = rows[startIndex].depth;
  let endIndex = startIndex;
  for (let i = startIndex + 1; i < rows.length; i += 1) {
    if (rows[i].depth > baseDepth) endIndex = i;
    else break;
  }
  return { startPath: rows[startIndex].path, endPath: rows[endIndex].path };
}
