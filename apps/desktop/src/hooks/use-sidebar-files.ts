import { useEffect, useState } from "react";
import {
  usePinnedFiles,
  useSidebarMetadataVersion,
  useWorkspaceFileCount,
} from "@/hooks/use-file-tree";
import { useWorkspaceRoot } from "@/hooks/use-workspace";
import * as tauri from "@/lib/tauri";
import type { DirEntry } from "@/types/fs";

export const SIDEBAR_SECTION_PAGE_SIZE = 6;
export const RECENTS_SECTION_PAGE_SIZE = 4;
const RECENTS_MIN_WORKSPACE_FILE_COUNT = 10;

const RECENTS_READ_PAGE_SIZE = 100;

interface SidebarFilesState {
  files: DirEntry[];
  hasMore: boolean;
  isLoading: boolean;
}

const EMPTY_STATE: SidebarFilesState = { files: [], hasMore: false, isLoading: false };

export function useRecentSidebarFiles(visibleCount: number): SidebarFilesState {
  const root = useWorkspaceRoot();
  const fileCount = useWorkspaceFileCount();
  const pinnedFiles = usePinnedFiles();
  const metadataVersion = useSidebarMetadataVersion();
  const [state, setState] = useState<SidebarFilesState>(EMPTY_STATE);

  // eslint-disable-next-line react-doctor/no-cascading-set-state
  useEffect(() => {
    if (!root || fileCount < RECENTS_MIN_WORKSPACE_FILE_COUNT) {
      // eslint-disable-next-line react-doctor/no-adjust-state-on-prop-change
      setState(EMPTY_STATE);
      return;
    }

    let cancelled = false;
    const pinnedSet = new Set(pinnedFiles);
    // eslint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setState((current) => ({ ...current, isLoading: true }));
    void (async () => {
      const unpinnedEntries: DirEntry[] = [];
      let offset = 0;

      while (unpinnedEntries.length <= visibleCount) {
        const entries = await tauri.readRecentFiles(RECENTS_READ_PAGE_SIZE, offset);
        if (entries.length === 0) break;

        unpinnedEntries.push(...entries.filter((entry) => !pinnedSet.has(entry.path)));
        offset += entries.length;

        if (entries.length < RECENTS_READ_PAGE_SIZE) break;
      }

      return unpinnedEntries;
    })()
      .then((entries) => {
        if (cancelled) return;
        setState({
          files: entries.slice(0, visibleCount),
          hasMore: entries.length > visibleCount,
          isLoading: false,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("Failed to read recent sidebar files", error);
        setState(EMPTY_STATE);
      });

    return () => {
      cancelled = true;
    };
  }, [fileCount, metadataVersion, pinnedFiles, root, visibleCount]);

  return state;
}

export function usePinnedSidebarFiles(visibleCount: number): SidebarFilesState {
  const root = useWorkspaceRoot();
  const pinnedFiles = usePinnedFiles();
  const metadataVersion = useSidebarMetadataVersion();
  const [state, setState] = useState<SidebarFilesState>(EMPTY_STATE);

  // eslint-disable-next-line react-doctor/no-cascading-set-state
  useEffect(() => {
    if (!root || pinnedFiles.length === 0) {
      // eslint-disable-next-line react-doctor/no-adjust-state-on-prop-change
      setState(EMPTY_STATE);
      return;
    }

    let cancelled = false;
    const paths = pinnedFiles.slice(0, visibleCount + 1);
    // eslint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setState((current) => ({ ...current, isLoading: true }));
    void tauri
      .readFileEntries(paths)
      .then((entries) => {
        if (cancelled) return;
        setState({
          files: entries.slice(0, visibleCount),
          hasMore: pinnedFiles.length > visibleCount || entries.length > visibleCount,
          isLoading: false,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("Failed to read pinned sidebar files", error);
        setState(EMPTY_STATE);
      });

    return () => {
      cancelled = true;
    };
  }, [metadataVersion, pinnedFiles, root, visibleCount]);

  return state;
}
