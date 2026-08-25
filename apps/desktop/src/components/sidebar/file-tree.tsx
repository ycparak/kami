import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  useDirectoryCache,
  useExpandedDirs,
  useInvalidatePath,
  usePinnedFiles,
  useRefreshDirectory,
  useRemovePinnedFile,
  useRemovePinnedFilesWithPrefix,
  useTogglePinnedFile,
  useToggleDirectory,
} from "@/hooks/use-file-tree";
import { useOpenFile } from "@/hooks/use-tabs";
import { useSetting } from "@/hooks/use-settings";
import { useWorkspaceRoot } from "@/hooks/use-workspace";
import * as tauri from "@/lib/tauri";
import { getFileStem, getParentDir } from "@/lib/paths";
import { useMoveEntry } from "./use-move-entry";
import { useTreeDrag } from "./use-tree-drag";
import { useFileTreeContextMenus } from "./use-file-tree-context-menus";
import { DragGhost } from "./drag-ghost";
import { FileTreeNode } from "./file-tree-node";
import { flattenTree } from "./flatten-tree";
import { useAutoRefresh } from "./use-auto-refresh";
import type { DirEntry } from "@/types/fs";

interface FileTreeProps {
  rootPath: string;
  openFile?: (path: string) => Promise<void>;
  enableContextMenus?: boolean;
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot);
}

export function FileTree({
  rootPath,
  openFile: openFileOverride,
  enableContextMenus = true,
}: FileTreeProps) {
  const directoryCache = useDirectoryCache();
  const expandedDirs = useExpandedDirs();
  const toggleDirectory = useToggleDirectory();
  const defaultOpenFile = useOpenFile();
  const openFile = openFileOverride ?? defaultOpenFile;
  const refreshDirectory = useRefreshDirectory();
  const invalidatePath = useInvalidatePath();
  const { applyPathChange, moveEntry } = useMoveEntry();
  const removePinnedFile = useRemovePinnedFile();
  const removePinnedFilesWithPrefix = useRemovePinnedFilesWithPrefix();
  const pinnedFiles = usePinnedFiles();
  const togglePinnedFile = useTogglePinnedFile();
  const workspaceRoot = useWorkspaceRoot();
  const fileLabelMode = useSetting("appearance.sidebar-file-label");
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const selectionAnchorRef = useRef<string | null>(null);

  const entries = useMemo(() => directoryCache.get(rootPath) ?? [], [directoryCache, rootPath]);

  useAutoRefresh(rootPath, entries.length === 0);

  const flatItems = useMemo(
    () => flattenTree(entries, 0, directoryCache, expandedDirs),
    [directoryCache, entries, expandedDirs],
  );

  const entryByPath = useMemo(() => {
    const map = new Map<string, DirEntry>();
    for (const item of flatItems) map.set(item.entry.path, item.entry);
    return map;
  }, [flatItems]);

  const clearSelection = useCallback(() => {
    setSelectedPaths(new Set());
    selectionAnchorRef.current = null;
  }, []);

  const { containerRef, ghostRef, draggingPaths, dropHighlight, dragGhost, beginDrag } =
    useTreeDrag({
      rootPath,
      flatItems,
      entryByPath,
      expandedDirs,
      moveEntry,
      toggleDirectory,
      clearSelection,
    });

  useEffect(() => {
    if (selectedPaths.size === 0) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedPaths(new Set());
        selectionAnchorRef.current = null;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPaths.size]);

  const onRowPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>, entry: DirEntry) => {
      if (event.button !== 0) return;

      if (event.shiftKey) {
        const anchor = selectionAnchorRef.current ?? flatItems[0]?.entry.path ?? null;
        if (!anchor) return;
        const anchorIndex = flatItems.findIndex((item) => item.entry.path === anchor);
        const targetIndex = flatItems.findIndex((item) => item.entry.path === entry.path);
        if (anchorIndex === -1 || targetIndex === -1) return;
        const next = new Set<string>();
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        for (let i = start; i <= end; i += 1) next.add(flatItems[i].entry.path);
        setSelectedPaths(next);
        return;
      }
      if (event.metaKey || event.ctrlKey) {
        const next = new Set(selectedPaths);
        if (next.has(entry.path)) next.delete(entry.path);
        else next.add(entry.path);
        setSelectedPaths(next);
        selectionAnchorRef.current = entry.path;
        return;
      }

      let dragged: DirEntry[];
      if (selectedPaths.size >= 2 && selectedPaths.has(entry.path)) {
        dragged = [...selectedPaths]
          .map((path) => entryByPath.get(path))
          .filter((item): item is DirEntry => Boolean(item));
        if (!dragged.some((item) => item.path === entry.path)) dragged.push(entry);
      } else {
        if (selectedPaths.size > 0) setSelectedPaths(new Set());
        selectionAnchorRef.current = entry.path;
        dragged = [entry];
      }
      beginDrag(event, dragged, entry);
    },
    [beginDrag, entryByPath, flatItems, selectedPaths],
  );

  const onRowClick = useCallback(
    (event: MouseEvent<HTMLElement>, entry: DirEntry) => {
      if (event.shiftKey || event.metaKey || event.ctrlKey) return;
      setSelectedPaths(new Set());
      selectionAnchorRef.current = entry.path;
      if (entry.is_dir) {
        void toggleDirectory(entry.path);
      } else {
        void openFile(entry.path);
      }
    },
    [openFile, toggleDirectory],
  );

  const handleRenameSubmit = useCallback(
    async (entry: DirEntry, nextValue: string) => {
      setRenamingPath(null);

      const trimmed = nextValue.trim();
      if (!trimmed) return;

      const parent = getParentDir(entry.path);
      let newPath: string;
      let conflictMessage: string;
      if (entry.is_dir) {
        if (trimmed === entry.name) return;
        newPath = `${parent}/${trimmed}`;
        conflictMessage = `A folder named "${trimmed}" already exists.`;
      } else {
        const currentStem = getFileStem(entry.name);
        if (trimmed === currentStem) return;
        const ext = getExtension(entry.name);
        newPath = `${parent}/${trimmed}${ext}`;
        conflictMessage = `A file named "${trimmed}${ext}" already exists.`;
      }
      if (newPath === entry.path) return;

      try {
        if (await tauri.fileExists(newPath)) {
          window.alert(conflictMessage);
          return;
        }
        await applyPathChange(entry, newPath);
      } catch (error) {
        window.alert(`Failed to rename: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [applyPathChange],
  );

  const handleRenameCancel = useCallback(() => {
    setRenamingPath(null);
  }, []);

  const { handleFileContextMenu, handleFolderContextMenu, handleBulkContextMenu } =
    useFileTreeContextMenus({
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
    });

  const handleContextMenu = useCallback(
    (_event: MouseEvent<HTMLElement>, entry: DirEntry) => {
      if (!enableContextMenus) return;

      if (selectedPaths.size >= 2 && selectedPaths.has(entry.path)) {
        handleBulkContextMenu(selectedPaths);
        return;
      }

      clearSelection();

      if (entry.is_dir) {
        handleFolderContextMenu(entry);
      } else {
        handleFileContextMenu(entry);
      }
    },
    [
      clearSelection,
      enableContextMenus,
      handleBulkContextMenu,
      handleFileContextMenu,
      handleFolderContextMenu,
      selectedPaths,
    ],
  );

  if (flatItems.length === 0) {
    return <div className="px-2 text-[13px] text-(--text-muted)">No files</div>;
  }

  return (
    <div
      ref={containerRef}
      className="relative isolate flex flex-col gap-px rounded-lg"
      role="tree"
      aria-label="File tree"
    >
      {dropHighlight && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -z-10 rounded-lg bg-(--surface-subtle)"
          style={{ top: dropHighlight.top, height: dropHighlight.height }}
        />
      )}
      {flatItems.map((item) => (
        <FileTreeNode
          key={item.entry.path}
          entry={item.entry}
          depth={item.depth}
          isExpanded={item.entry.is_dir && expandedDirs.has(item.entry.path)}
          isRenaming={renamingPath === item.entry.path}
          isSelected={selectedPaths.has(item.entry.path)}
          isDragging={draggingPaths?.has(item.entry.path) ?? false}
          onToggleDir={toggleDirectory}
          onOpenFile={openFile}
          onClick={onRowClick}
          onContextMenu={enableContextMenus ? handleContextMenu : undefined}
          onPointerDown={onRowPointerDown}
          onRenameSubmit={handleRenameSubmit}
          onRenameCancel={handleRenameCancel}
          fileLabelMode={fileLabelMode}
        />
      ))}
      {dragGhost &&
        createPortal(
          <div
            ref={ghostRef}
            aria-hidden="true"
            className="pointer-events-none fixed left-0 top-0 z-50"
            style={{ opacity: 0 }}
          >
            <DragGhost
              entry={dragGhost.entry}
              count={dragGhost.count}
              width={dragGhost.width}
              paddingLeft={dragGhost.paddingLeft}
              isExpanded={dragGhost.isExpanded}
              fileLabelMode={fileLabelMode}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
