import { useEditorStore } from "@/stores/editor-store";

export function useFrontmatter(filePath: string | null) {
  const frontmatter = useEditorStore(
    (s) => (filePath ? s.openFiles.get(filePath)?.frontmatter : undefined) ?? null,
  );
  const updateFrontmatter = useEditorStore((s) => s.updateFrontmatter);

  return {
    frontmatter: frontmatter ?? "",
    hasFrontmatter: frontmatter !== null,
    updateFrontmatter: (value: string) => {
      if (!filePath) return;
      updateFrontmatter(filePath, value);
    },
    removeFrontmatter: () => {
      if (!filePath) return;
      updateFrontmatter(filePath, null);
    },
  };
}
