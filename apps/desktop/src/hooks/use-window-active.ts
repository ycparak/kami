import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const INACTIVE_ATTR = "data-window-inactive";

export function useWindowActive() {
  useEffect(() => {
    const root = document.documentElement;
    const apply = (isFocused: boolean) => {
      root.toggleAttribute(INACTIVE_ATTR, !isFocused);
    };

    apply(document.hasFocus());
    void getCurrentWindow()
      .isFocused()
      .then(apply)
      .catch(() => {});

    const unlisten = getCurrentWindow().onFocusChanged(({ payload }) => apply(payload));
    return () => {
      void unlisten.then((off) => off());
      root.removeAttribute(INACTIVE_ATTR);
    };
  }, []);
}
