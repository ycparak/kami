import { useEffect } from "react";
import { closeEditorSearch } from "./editor-search-store";

export function useCloseEditorSearchWhenInactive(isActive: boolean) {
  /* eslint-disable react-doctor/no-event-handler */
  useEffect(() => {
    if (!isActive) closeEditorSearch();
  }, [isActive]);
  /* eslint-enable react-doctor/no-event-handler */
}
