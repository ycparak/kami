import { useEffect } from "react";
import { useRefreshDirectory } from "@/hooks/use-file-tree";

export function useAutoRefresh(path: string, isEmpty: boolean) {
  const refreshDirectory = useRefreshDirectory();

  useEffect(() => {
    if (!isEmpty) return;
    void refreshDirectory(path);
  }, [path, isEmpty, refreshDirectory]);
}
