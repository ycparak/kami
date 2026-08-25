import { useCallback } from "react";
import {
  useRefreshDirectory,
  useRewriteExpandedDir,
  useRewritePinnedPath,
} from "@/hooks/use-file-tree";
import { renameOpenFile, rewritePathPrefix } from "@/hooks/editor-api";
import * as tauri from "@/lib/tauri";
import { getParentDir } from "@/lib/paths";
import type { DirEntry } from "@/types/fs";
import { canMoveInto, computeMovePath } from "./tree-move";

export type MoveOutcome =
  | { status: "moved"; entry: DirEntry; newPath: string }
  | { status: "skipped"; entry: DirEntry }
  | { status: "exists"; entry: DirEntry; newPath: string }
  | { status: "error"; entry: DirEntry; error: unknown };

export function useMoveEntry() {
  const refreshDirectory = useRefreshDirectory();
  const rewriteExpandedDir = useRewriteExpandedDir();
  const rewritePinnedPath = useRewritePinnedPath();

  const applyPathChange = useCallback(
    async (entry: DirEntry, newPath: string): Promise<void> => {
      await tauri.renameEntry(entry.path, newPath);
      if (entry.is_dir) {
        rewritePathPrefix(entry.path, newPath);
        rewriteExpandedDir(entry.path, newPath);
        rewritePinnedPath(entry.path, newPath);
      } else {
        renameOpenFile(entry.path, newPath);
        rewritePinnedPath(entry.path, newPath);
      }
      const fromParent = getParentDir(entry.path);
      const toParent = getParentDir(newPath);
      await refreshDirectory(fromParent);
      if (toParent !== fromParent) await refreshDirectory(toParent);
    },
    [refreshDirectory, rewriteExpandedDir, rewritePinnedPath],
  );

  const moveEntry = useCallback(
    async (entry: DirEntry, destDir: string): Promise<MoveOutcome> => {
      if (!canMoveInto(entry.path, entry.is_dir, destDir)) {
        return { status: "skipped", entry };
      }
      const newPath = computeMovePath(entry, destDir);
      if (await tauri.fileExists(newPath)) {
        return { status: "exists", entry, newPath };
      }
      try {
        await applyPathChange(entry, newPath);
        return { status: "moved", entry, newPath };
      } catch (error) {
        return { status: "error", entry, error };
      }
    },
    [applyPathChange],
  );

  return { applyPathChange, moveEntry };
}
