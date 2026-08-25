import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useSettingsStore } from "@/stores/settings-store";
import * as editorApi from "./editor-api";
import * as tauri from "@/lib/tauri";
import { cancelSave, isSaveInFlight } from "@/lib/save";

interface FileChangePayload {
  path: string;
  kind: "modified" | "created" | "deleted" | "renamed";
}

const WATCHER_DEBUG = import.meta.env.DEV;

export function useFileWatcher() {
  useEffect(() => {
    const unlistenFile = listen<FileChangePayload>("fs:file-changed", (event) => {
      const { path, kind } = event.payload;
      if (WATCHER_DEBUG) console.debug("[watcher] fs:file-changed", kind, path);
      useWorkspaceStore.getState().bumpSidebarMetadataVersion();
      const openFiles = editorApi.getOpenFiles();
      const file = openFiles.get(path);

      if (!file) return;
      if (kind === "deleted") return;
      if (isSaveInFlight(path)) return;

      cancelSave(path);
      void tauri.readFile(path).then((content) => {
        const latest = editorApi.getOpenFiles().get(path);
        if (!latest || content.content === latest.diskContent) return;
        if (WATCHER_DEBUG) console.debug("[watcher] reload-from-disk", path);
        editorApi.reloadFromDisk(path, content.content);
      });
    });

    const unlistenIndexComplete = listen<number>("index:complete", (event) => {
      if (useWorkspaceStore.getState().root) {
        useWorkspaceStore.setState((state) => ({
          fileCount: event.payload,
          isIndexing: false,
          sidebarMetadataVersion: state.sidebarMetadataVersion + 1,
        }));
      }
    });

    const unlistenSidebarMetadata = listen("sidebar:metadata-changed", () => {
      useWorkspaceStore.getState().bumpSidebarMetadataVersion();
    });

    const unlistenSettings = listen("settings:changed", () => {
      void useSettingsStore.getState().loadSettings();
    });

    const unlistenDir = listen<FileChangePayload>("fs:directory-changed", (event) => {
      const { path } = event.payload;
      if (WATCHER_DEBUG) console.debug("[watcher] fs:directory-changed", path);
      const { root, expandedDirs, invalidatePath, refreshDirectory, bumpSidebarMetadataVersion } =
        useWorkspaceStore.getState();
      bumpSidebarMetadataVersion();

      if (expandedDirs.has(path) || path === root) {
        void refreshDirectory(path);
      } else {
        invalidatePath(path);
      }

      const parent = path.substring(0, path.lastIndexOf("/"));
      if (parent) {
        if (expandedDirs.has(parent) || parent === root) {
          void refreshDirectory(parent);
        } else {
          invalidatePath(parent);
        }
      }
    });

    return () => {
      void unlistenFile.then((fn) => fn());
      void unlistenIndexComplete.then((fn) => fn());
      void unlistenSidebarMetadata.then((fn) => fn());
      void unlistenSettings.then((fn) => fn());
      void unlistenDir.then((fn) => fn());
    };
  }, []);
}
