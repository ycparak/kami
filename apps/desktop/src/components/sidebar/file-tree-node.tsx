import { memo, useEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { useIsActive } from "@/hooks/use-tabs";
import { getFileStem } from "@/lib/paths";
import type { DirEntry } from "@/types/fs";
import { FileIcon, FolderIcon } from "./file-tree-icons";
import { useFileTreeLabel } from "./use-file-tree-label";

interface FileTreeNodeProps {
  entry: DirEntry;
  depth: number;
  isExpanded: boolean;
  isRenaming: boolean;
  isSelected: boolean;
  isDragging?: boolean;
  onToggleDir: (path: string) => Promise<void>;
  onOpenFile: (path: string) => Promise<void>;
  onClick?: (event: MouseEvent<HTMLElement>, entry: DirEntry) => void;
  onContextMenu?: (event: MouseEvent<HTMLElement>, entry: DirEntry) => void;
  onPointerDown?: (event: PointerEvent<HTMLElement>, entry: DirEntry) => void;
  onRenameSubmit?: (entry: DirEntry, nextStem: string) => void;
  onRenameCancel?: () => void;
  fileLabelMode?: string;
}

export const FileTreeNode = memo(function FileTreeNode({
  entry,
  depth,
  isExpanded,
  isRenaming,
  isSelected,
  isDragging,
  onToggleDir,
  onOpenFile,
  onClick,
  onContextMenu,
  onPointerDown,
  onRenameSubmit,
  onRenameCancel,
  fileLabelMode,
}: FileTreeNodeProps) {
  const isActive = useIsActive(entry.path);
  const displayName = useFileTreeLabel(entry, fileLabelMode);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isRenaming) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [isRenaming]);

  const isHighlighted = isActive || isSelected;

  function handleClick(event: MouseEvent<HTMLElement>) {
    if (isRenaming) return;
    if (onClick) {
      onClick(event, entry);
      return;
    }
    if (entry.is_dir) {
      void onToggleDir(entry.path);
    } else {
      void onOpenFile(entry.path);
    }
  }

  function handleContextMenu(event: MouseEvent<HTMLElement>) {
    if (!entry.is_dir && !entry.is_markdown) return;
    if (!onContextMenu) return;
    event.preventDefault();
    event.stopPropagation();
    onContextMenu(event, entry);
  }

  if (isRenaming) {
    const initialValue = entry.is_dir ? entry.name : getFileStem(entry.name);
    return (
      <div
        className={`flex h-[32px] w-full items-center gap-1.5 overflow-hidden rounded-lg pr-2 text-[13px] leading-[1.15] ${
          isActive ? "bg-[var(--surface-subtle)]" : ""
        }`}
        style={{ paddingLeft: depth === 0 ? 10 : depth * 12 + 6 }}
      >
        <span
          className="flex w-5 antialiased shrink-0 items-center justify-center text-current"
          aria-hidden="true"
        >
          {entry.is_dir ? <FolderIcon isExpanded={isExpanded} /> : <FileIcon />}
        </span>
        <input
          ref={inputRef}
          type="text"
          defaultValue={initialValue}
          aria-label={`Rename ${entry.name}`}
          className="min-w-0 flex-1 rounded border border-[var(--surface-border)] bg-[var(--surface-elevated)] px-1 py-px text-[13px] leading-[1.15] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onRenameSubmit?.(entry, event.currentTarget.value);
            } else if (event.key === "Escape") {
              event.preventDefault();
              onRenameCancel?.();
            }
          }}
          onBlur={(event) => onRenameSubmit?.(entry, event.currentTarget.value)}
        />
      </div>
    );
  }

  const bgClassName = isSelected
    ? "bg-[var(--surface-selected)]"
    : isActive
      ? "bg-[var(--surface-subtle)]"
      : "hover:bg-[var(--surface-subtle)]";

  return (
    <button
      type="button"
      role="treeitem"
      data-tree-path={entry.path}
      aria-selected={isActive}
      aria-expanded={entry.is_dir ? isExpanded : undefined}
      aria-label={entry.is_dir ? `${entry.name} folder` : displayName}
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={onPointerDown ? (event) => onPointerDown(event, entry) : undefined}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      className={`group ${entry.is_dir ? "group/folder " : ""}flex h-[32px] w-full items-center gap-1.5 overflow-hidden rounded-lg pr-2 text-left text-[13px] leading-[1.15] text-[var(--fg-base)] ${isDragging ? "opacity-40" : ""} ${bgClassName}`}
      style={{ paddingLeft: depth === 0 ? 10 : depth * 12 + 6 }}
    >
      <span className="relative flex w-5 shrink-0 items-center justify-center">
        {entry.is_dir ? (
          <>
            <span className="flex items-center justify-center opacity-60 group-hover:opacity-100 group-hover/folder:opacity-0">
              <FolderIcon isExpanded={isExpanded} />
            </span>
            <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/folder:opacity-100">
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={16}
                color="currentColor"
                strokeWidth={2}
                className={`transition-transform duration-200 ease-out ${isExpanded ? "rotate-90" : ""}`}
              />
            </span>
          </>
        ) : (
          <span className="opacity-60 group-hover:opacity-100">
            <FileIcon />
          </span>
        )}
      </span>
      <span
        className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap ${isHighlighted ? "opacity-100" : "opacity-60 group-hover:opacity-100"}`}
      >
        {displayName}
      </span>
    </button>
  );
});
