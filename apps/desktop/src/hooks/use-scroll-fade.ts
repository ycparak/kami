import { useCallback, useRef, useState } from "react";

export function useScrollFade(axis: "vertical" | "horizontal" = "vertical") {
  const [scrolledStart, setScrolledStart] = useState(false);
  const [scrolledEnd, setScrolledEnd] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const updateScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (axis === "vertical") {
      setScrolledStart(el.scrollTop > 4);
      setScrolledEnd(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    } else {
      setScrolledStart(el.scrollLeft > 4);
      setScrolledEnd(el.scrollWidth - el.scrollLeft - el.clientWidth > 4);
    }
  }, [axis]);

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      scrollRef.current = el;
      if (el) updateScroll();
    },
    [updateScroll],
  );

  return { setRef, scrolledStart, scrolledEnd, onScroll: updateScroll };
}
