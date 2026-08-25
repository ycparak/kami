import type { DirEntry } from "@/types/fs";
import { FileIcon, FolderIcon } from "./file-tree-icons";
import { useFileTreeLabel } from "./use-file-tree-label";

interface DragGhostProps {
  entry: DirEntry;
  count: number;
  width: number;
  paddingLeft: string;
  isExpanded: boolean;
  fileLabelMode?: string;
}

export function DragGhost({
  entry,
  count,
  width,
  paddingLeft,
  isExpanded,
  fileLabelMode,
}: DragGhostProps) {
  const label = useFileTreeLabel(entry, fileLabelMode);
  return (
    <div className="relative" style={{ width }}>
      <div
        className="flex h-[32px] items-center gap-1.5 overflow-hidden rounded-lg bg-[var(--surface-selected)] pr-2 text-[13px] leading-[1.15] text-[var(--fg-base)]"
        style={{ paddingLeft }}
      >
        <span className="flex w-5 shrink-0 items-center justify-center opacity-60">
          {entry.is_dir ? <FolderIcon isExpanded={isExpanded} /> : <FileIcon />}
        </span>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
      </div>
      {count > 1 && (
        <span className="absolute -right-2 -top-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[11px] font-semibold leading-none text-white shadow-md ring-2 ring-[var(--bg-base)]">
          {count}
        </span>
      )}
    </div>
  );
}
