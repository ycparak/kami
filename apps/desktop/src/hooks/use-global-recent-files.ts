import { useCallback, useEffect, useState } from "react";
import * as tauri from "@/lib/tauri";
import type { RecentFile } from "@/lib/tauri";

/* eslint-disable react-doctor/no-derived-state */

interface GlobalRecentFiles {
  files: RecentFile[];
  loaded: boolean;
  remove: (path: string) => void;
  refresh: () => void;
}

export function useGlobalRecentFiles(limit = 30, enabled = true): GlobalRecentFiles {
  const [files, setFiles] = useState<RecentFile[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    let cancelled = false;
    void tauri
      .getRecentFilesGlobal(limit)
      .then((entries) => {
        if (cancelled) return;
        setFiles(entries);
        setLoaded(true);
      })
      .catch((error: unknown) => {
        console.error("Failed to read global recent files", error);
      });
    return () => {
      cancelled = true;
    };
  }, [limit]);

  useEffect(() => {
    if (!enabled) return;
    return refresh();
  }, [enabled, refresh]);

  const remove = useCallback((path: string) => {
    setFiles((prev) => prev.filter((file) => file.path !== path));
    tauri.removeRecentFile(path).catch((error: unknown) => {
      console.error("Failed to remove recent file", error);
    });
  }, []);

  return { files, loaded, remove, refresh };
}
