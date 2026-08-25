import { useEffect, useState } from "react";

export interface MountTransition {
  shouldRender: boolean;
  phase: "open" | "closed";
}

export function useMountTransition(active: boolean, durationMs: number): MountTransition {
  const [shouldRender, setShouldRender] = useState(false);
  const [phase, setPhase] = useState<"open" | "closed">("closed");

  // eslint-disable-next-line react-doctor/no-cascading-set-state
  useEffect(() => {
    if (active) {
      // eslint-disable-next-line react-doctor/no-adjust-state-on-prop-change
      setShouldRender(true);
      const frame = requestAnimationFrame(() => setPhase("open"));
      return () => cancelAnimationFrame(frame);
    }
    // eslint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setPhase("closed");
    const timer = window.setTimeout(() => setShouldRender(false), durationMs);
    return () => clearTimeout(timer);
  }, [active, durationMs]);

  return { shouldRender, phase };
}
