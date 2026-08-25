import { useEffect, useRef } from "react";

export function useEscKey(active: boolean, onEsc: () => void) {
  const onEscRef = useRef(onEsc);
  onEscRef.current = onEsc;

  useEffect(() => {
    if (!active) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onEscRef.current();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active]);
}
