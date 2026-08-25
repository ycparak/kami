import { useResolvedDocumentTitle } from "@/hooks/use-tabs";
import { getFileStem } from "@/lib/paths";
import type { DirEntry } from "@/types/fs";

export function useFileTreeLabel(entry: DirEntry, fileLabelMode?: string): string {
  const editorTitle = useResolvedDocumentTitle(entry.is_dir ? null : entry.path);
  if (entry.is_dir) return entry.name;
  if (fileLabelMode === "filename") return getFileStem(entry.name);
  return editorTitle || entry.title || getFileStem(entry.name);
}
