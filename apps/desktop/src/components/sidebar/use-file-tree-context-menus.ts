import { useCallback } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  getOpenFile,
  getOpenFiles,
  openFileInNewTab as openFileInNewTabAction,
  removePathReferences,
  removePathsWithPrefix,
} from "@/hooks/editor-api";
import * as tauri from "@/lib/tauri";
import { getParentDir, getRelativePath } from "@/lib/paths";
import { duplicateFile } from "./duplicate-file";
import { showFileContextMenu } from "./file-context-menu";
import { showFolderContextMenu } from "./folder-context-menu";
import { showBulkContextMenu } from "./bulk-context-menu";
import type { DirEntry } from "@/types/fs";

async function resolveUniqueName(
  parentPath: string,
  baseName: string,
  extension: string,
): Promise<string> {
  const first = `${parentPath}/${baseName}${extension}`;
  if (!(await tauri.fileExists(first))) return first;

  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${parentPath}/${baseName} ${n}${extension}`;
    if (!(await tauri.fileExists(candidate))) return candidate;
  }

  throw new Error(`Could not find an available name for "${baseName}" in ${parentPath}`);
}

interface UseFileTreeContextMenusArgs {
  openFile: (path: string) => Promise<void>;
  workspaceRoot: string | null;
  pinnedFiles: string[];
  togglePinnedFile: (path: string) => void;
  removePinnedFile: (path: string) => void;
  removePinnedFilesWithPrefix: (prefix: string) => void;
  expandedDirs: Set<string>;
  toggleDirectory: (path: string) => Promise<void>;
  refreshDirectory: (path: string) => Promise<void>;
  invalidatePath: (path: string) => void;
  setRenamingPath: (path: string | null) => void;
  clearSelection: () => void;
}

export function useFileTreeContextMenus({
  openFile,
  workspaceRoot,
  pinnedFiles,
  togglePinnedFile,
  removePinnedFile,
  removePinnedFilesWithPrefix,
  expandedDirs,
  toggleDirectory,
  refreshDirectory,
  invalidatePath,
  setRenamingPath,
  clearSelection,
}: UseFileTreeContextMenusArgs) {
  const handleFileContextMenu = useCallback(
    (entry: DirEntry) => {
      const parent = getParentDir(entry.path);
      const relative = workspaceRoot ? getRelativePath(entry.path, workspaceRoot) : entry.path;

      void showFileContextMenu({
        isPinned: pinnedFiles.includes(entry.path),
        onOpen: () => {
          void openFile(entry.path);
        },
        onOpenInNewTab: () => {
          void openFileInNewTabAction(entry.path).catch((error: unknown) => {
            window.alert(
              `Failed to open in new tab: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
        },
        onDuplicate: () => {
          void (async () => {
            try {
              const newPath = await duplicateFile(entry.path);
              await refreshDirectory(parent);
              await openFileInNewTabAction(newPath);
            } catch (error) {
              window.alert(
                `Failed to duplicate: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          })();
        },
        onTogglePin: () => {
          togglePinnedFile(entry.path);
        },
        onCopyRelativePath: () => {
          void writeText(relative);
        },
        onCopyAbsolutePath: () => {
          void writeText(entry.path);
        },
        onReveal: () => {
          void tauri.revealInFileManager(entry.path).catch((error: unknown) => {
            window.alert(
              `Failed to reveal: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
        },
        onRename: () => {
          setRenamingPath(entry.path);
        },
        onDelete: () => {
          void (async () => {
            const openFileState = getOpenFile(entry.path);
            if (openFileState?.isDirty) {
              const confirmed = window.confirm(
                `"${entry.name}" has unsaved changes. Delete anyway?`,
              );
              if (!confirmed) return;
            }
            try {
              await tauri.deleteEntry(entry.path);
              removePathReferences(entry.path);
              removePinnedFile(entry.path);
              await refreshDirectory(parent);
            } catch (error) {
              window.alert(
                `Failed to delete: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          })();
        },
      });
    },
    [
      openFile,
      pinnedFiles,
      refreshDirectory,
      removePinnedFile,
      setRenamingPath,
      togglePinnedFile,
      workspaceRoot,
    ],
  );

  const handleFolderContextMenu = useCallback(
    (entry: DirEntry) => {
      const parent = getParentDir(entry.path);
      const relative = workspaceRoot ? getRelativePath(entry.path, workspaceRoot) : entry.path;

      void showFolderContextMenu({
        onNewFile: () => {
          void (async () => {
            try {
              const filePath = await resolveUniqueName(entry.path, "Untitled", ".md");
              await tauri.createFile(filePath);
              if (!expandedDirs.has(entry.path)) {
                await toggleDirectory(entry.path);
              } else {
                await refreshDirectory(entry.path);
              }
              setRenamingPath(filePath);
            } catch (error) {
              window.alert(
                `Failed to create file: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          })();
        },
        onNewFolder: () => {
          void (async () => {
            try {
              const folderPath = await resolveUniqueName(entry.path, "Untitled Folder", "");
              await tauri.createDirectory(folderPath);
              if (!expandedDirs.has(entry.path)) {
                await toggleDirectory(entry.path);
              } else {
                await refreshDirectory(entry.path);
              }
              setRenamingPath(folderPath);
            } catch (error) {
              window.alert(
                `Failed to create folder: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          })();
        },
        onCopyRelativePath: () => {
          void writeText(relative);
        },
        onCopyAbsolutePath: () => {
          void writeText(entry.path);
        },
        onReveal: () => {
          void tauri.revealInFileManager(entry.path).catch((error: unknown) => {
            window.alert(
              `Failed to reveal: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
        },
        onRename: () => {
          setRenamingPath(entry.path);
        },
        onDelete: () => {
          void (async () => {
            const openFiles = getOpenFiles();
            const dirPrefix = `${entry.path}/`;
            let dirtyCount = 0;
            for (const [path, file] of openFiles) {
              if (path.startsWith(dirPrefix) && file.isDirty) {
                dirtyCount += 1;
              }
            }

            if (dirtyCount > 0) {
              const confirmed = window.confirm(
                `"${entry.name}" contains ${dirtyCount} unsaved file${dirtyCount > 1 ? "s" : ""}. Delete anyway?`,
              );
              if (!confirmed) return;
            }

            try {
              await tauri.deleteEntry(entry.path);
              removePathsWithPrefix(entry.path);
              removePinnedFilesWithPrefix(entry.path);
              invalidatePath(entry.path);
              await refreshDirectory(parent);
            } catch (error) {
              window.alert(
                `Failed to delete: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          })();
        },
      });
    },
    [
      expandedDirs,
      invalidatePath,
      refreshDirectory,
      removePinnedFilesWithPrefix,
      setRenamingPath,
      toggleDirectory,
      workspaceRoot,
    ],
  );

  const handleBulkContextMenu = useCallback(
    (paths: Set<string>) => {
      const pathArray = [...paths];

      void showBulkContextMenu(
        {
          onCopyRelativePaths: () => {
            const relatives = pathArray.map((p) =>
              workspaceRoot ? getRelativePath(p, workspaceRoot) : p,
            );
            void writeText(relatives.join("\n"));
          },
          onCopyAbsolutePaths: () => {
            void writeText(pathArray.join("\n"));
          },
          onDelete: () => {
            void (async () => {
              const openFilesMap = getOpenFiles();
              let dirtyCount = 0;
              for (const p of pathArray) {
                const file = openFilesMap.get(p);
                if (file?.isDirty) dirtyCount += 1;
              }

              if (dirtyCount > 0) {
                const confirmed = window.confirm(
                  `${dirtyCount} of ${pathArray.length} selected items have unsaved changes. Delete anyway?`,
                );
                if (!confirmed) return;
              } else {
                const confirmed = window.confirm(`Delete ${pathArray.length} items?`);
                if (!confirmed) return;
              }

              const parentDirs = new Set<string>();
              await Promise.all(
                pathArray.map(async (p) => {
                  try {
                    await tauri.deleteEntry(p);
                    removePathReferences(p);
                    removePinnedFile(p);
                    removePinnedFilesWithPrefix(p);
                    parentDirs.add(getParentDir(p));
                  } catch (error) {
                    window.alert(
                      `Failed to delete "${p}": ${error instanceof Error ? error.message : String(error)}`,
                    );
                  }
                }),
              );

              clearSelection();
              await Promise.all([...parentDirs].map((dir) => refreshDirectory(dir)));
            })();
          },
        },
        pathArray.length,
      );
    },
    [
      clearSelection,
      refreshDirectory,
      removePinnedFile,
      removePinnedFilesWithPrefix,
      workspaceRoot,
    ],
  );

  return { handleFileContextMenu, handleFolderContextMenu, handleBulkContextMenu };
}
