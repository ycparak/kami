import { useCallback, useRef, useState } from "react";
import { useFrontmatter } from "@/hooks/use-frontmatter";
import {
  makeEntryId,
  parseYamlEntries,
  serializeYamlEntries,
  type YamlEntry,
} from "@/lib/yaml-entries";

function makeEmptyRow(): YamlEntry {
  return { id: makeEntryId(), key: "", value: "", isComplex: false };
}

function seedOrParse(frontmatter: string | null): YamlEntry[] {
  if (frontmatter === null) return [];
  const parsed = parseYamlEntries(frontmatter);
  return parsed.length > 0 ? parsed : [makeEmptyRow()];
}

function focusActiveEditor() {
  requestAnimationFrame(() => {
    const active =
      document.querySelector<HTMLElement>(".cm-editor.cm-focused .cm-content") ??
      document.querySelector<HTMLElement>(".cm-editor .cm-content");
    active?.focus();
  });
}

export function useFrontmatterEntries(filePath: string) {
  const { frontmatter, hasFrontmatter, updateFrontmatter, removeFrontmatter } =
    useFrontmatter(filePath);
  const rawFrontmatter = hasFrontmatter ? frontmatter : null;

  const [localEntries, setLocalEntries] = useState<YamlEntry[]>(() => seedOrParse(rawFrontmatter));
  const lastFrontmatterRef = useRef<string | null>(rawFrontmatter);

  if (rawFrontmatter !== lastFrontmatterRef.current) {
    lastFrontmatterRef.current = rawFrontmatter;
    setLocalEntries(seedOrParse(rawFrontmatter));
  }

  const commit = useCallback(
    (next: YamlEntry[]) => {
      setLocalEntries(next);
      if (next.length === 0) {
        lastFrontmatterRef.current = null;
        removeFrontmatter();
        focusActiveEditor();
        return;
      }
      const yaml = serializeYamlEntries(next);
      lastFrontmatterRef.current = yaml;
      updateFrontmatter(yaml);
    },
    [updateFrontmatter, removeFrontmatter],
  );

  const updateEntry = useCallback(
    (index: number, field: "key" | "value", value: string) => {
      commit(localEntries.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)));
    },
    [localEntries, commit],
  );

  const removeEntry = useCallback(
    (index: number) => {
      commit(localEntries.filter((_, i) => i !== index));
    },
    [localEntries, commit],
  );

  const addEntry = useCallback(() => {
    setLocalEntries((prev) => [...prev, makeEmptyRow()]);
  }, []);

  const blurEntry = useCallback(
    (index: number) => {
      const row = localEntries[index];
      if (!row || row.key.trim() !== "") return;
      commit(localEntries.filter((_, i) => i !== index));
    },
    [localEntries, commit],
  );

  return {
    entries: localEntries,
    updateEntry,
    removeEntry,
    addEntry,
    blurEntry,
    removeFrontmatter,
    hasFrontmatter,
  };
}
