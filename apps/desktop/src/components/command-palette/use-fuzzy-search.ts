import { useEffect, useState } from "react";
import * as tauri from "@/lib/tauri";
import type { SearchResult } from "@/types/fs";

export function useFuzzySearch(query: string, limit = 20) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const hasQuery = query.trim() !== "";

  useEffect(() => {
    if (!hasQuery) {
      setResults((previous) => (previous.length === 0 ? previous : []));
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      tauri
        .fuzzySearch(query, limit)
        .then((next) => {
          if (!cancelled) setResults(next);
        })
        .catch((error: unknown) => {
          if (!cancelled) console.error("[command-palette] Fuzzy search failed:", error);
        });
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, limit, hasQuery]);

  return hasQuery ? results : [];
}
