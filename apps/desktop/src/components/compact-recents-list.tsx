import { useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, File02Icon } from "@hugeicons/core-free-icons";
import { useGlobalRecentFiles } from "@/hooks/use-global-recent-files";
import { useActiveFilePath } from "@/hooks/use-tabs";
import { getFileStem } from "@/lib/paths";
import type { RecentFile } from "@/lib/tauri";
import { SIDEBAR_SECTION_LABEL_CLASS } from "./sidebar/sidebar-section";

interface CompactRecentsListProps {
  openFile: (path: string) => Promise<void>;
  onOpenFileComplete?: () => void;
  className?: string;
}

function recentLabel(entry: RecentFile) {
  return entry.title || getFileStem(entry.name);
}

export function CompactRecentsList({
  openFile,
  onOpenFileComplete,
  className,
}: CompactRecentsListProps) {
  const { files: recentFiles, loaded, remove } = useGlobalRecentFiles();
  const activeFilePath = useActiveFilePath();
  const visibleRecentFiles = recentFiles.filter((entry) => entry.path !== activeFilePath);

  const openFileAndComplete = useCallback(
    async (path: string) => {
      await openFile(path);
      onOpenFileComplete?.();
    },
    [onOpenFileComplete, openFile],
  );

  return (
    <div className={className}>
      <div className={SIDEBAR_SECTION_LABEL_CLASS}>Recents</div>

      {visibleRecentFiles.length > 0 ? (
        <menu aria-label="Recent files" className="flex flex-col gap-px">
          {visibleRecentFiles.map((entry) => (
            <RecentFileRow
              key={entry.path}
              entry={entry}
              isActive={entry.path === activeFilePath}
              onOpen={openFileAndComplete}
              onRemove={remove}
            />
          ))}
        </menu>
      ) : loaded ? (
        <div className="px-2.5 py-3 text-[13px] text-[var(--text-muted)]">
          No other recent files.
        </div>
      ) : null}
    </div>
  );
}

interface RecentFileRowProps {
  entry: RecentFile;
  isActive: boolean;
  onOpen: (path: string) => Promise<void>;
  onRemove: (path: string) => void;
}

function RecentFileRow({ entry, isActive, onOpen, onRemove }: RecentFileRowProps) {
  const label = recentLabel(entry);

  return (
    <div
      className={`group relative flex items-stretch rounded-lg ${
        isActive ? "bg-[var(--surface-subtle)]" : "hover:bg-[var(--surface-subtle)]"
      }`}
    >
      <button
        type="button"
        onClick={() => void onOpen(entry.path)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1.5 pl-[10px] pr-8 text-left"
      >
        <span
          className="flex w-5 shrink-0 items-center justify-center antialiased text-[var(--text-icon-muted)]"
          aria-hidden="true"
        >
          <HugeiconsIcon icon={File02Icon} size={16} color="currentColor" strokeWidth={1.8} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] leading-[1.2] text-[var(--fg-base)]">
            {label}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={`Remove ${label} from recents`}
        onClick={() => onRemove(entry.path)}
        className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-icon-muted)] opacity-0 transition-opacity hover:bg-[var(--surface-elevated)] hover:text-[var(--fg-base)] group-hover:opacity-100 focus-visible:opacity-100"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={12} color="currentColor" strokeWidth={2} />
      </button>
    </div>
  );
}
