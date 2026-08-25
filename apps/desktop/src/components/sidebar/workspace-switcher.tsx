import { useRef } from "react";
import { useWorkspace } from "@/hooks/use-workspace";
import * as tauri from "@/lib/tauri";
import {
  showNativeContextMenu,
  type MenuItemSpec,
} from "@/components/editor-area/editor-context-menu";

function getFolderName(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

export function WorkspaceSwitcher() {
  const { root, recentWorkspaces, openWorkspace, closeWorkspace } = useWorkspace();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const workspaceName = root ? getFolderName(root) : "No Workspace";

  async function handleOpenFolder() {
    const picked = await tauri.pickWorkspace();
    if (picked) {
      await openWorkspace(picked);
    }
  }

  async function showMenu() {
    const others = recentWorkspaces.filter((p) => p !== root);
    const items: MenuItemSpec[] = [];

    for (const path of others) {
      items.push({
        kind: "item",
        id: `switch:${path}`,
        text: getFolderName(path),
        action: () => {
          void openWorkspace(path);
        },
      });
    }
    if (others.length > 0) {
      items.push({ kind: "separator" });
    }
    items.push({
      kind: "item",
      id: "open-folder",
      text: "Open Folder\u2026",
      action: () => {
        void handleOpenFolder();
      },
    });
    if (root) {
      items.push({
        kind: "item",
        id: "close-workspace",
        text: "Close Workspace",
        action: () => {
          closeWorkspace();
        },
      });
    }

    const rect = buttonRef.current?.getBoundingClientRect();
    const itemRowHeight = 22;
    const separatorHeight = 12;
    const verticalPadding = 8;
    const itemCount = items.filter((i) => i.kind !== "separator").length;
    const separatorCount = items.filter((i) => i.kind === "separator").length;
    const estimatedMenuHeight =
      itemCount * itemRowHeight + separatorCount * separatorHeight + verticalPadding;

    const position = rect
      ? { x: Math.round(rect.left), y: Math.round(rect.top - estimatedMenuHeight) }
      : undefined;

    await showNativeContextMenu(items, position);
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => void showMenu()}
      aria-label="Switch workspace"
      className="flex h-[32px] w-full items-center gap-1.5 overflow-hidden rounded-lg pl-[10px] pr-2 text-left text-[13px] leading-[1.15] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--fg-base)]"
    >
      <span
        className="flex w-5 shrink-0 items-center justify-center text-current"
        aria-hidden="true"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" strokeLinejoin="round">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M8.71 2.4C8.32 2.01 7.68 2.01 7.29 2.4L4.47 5.22L3.94 5.75L5 6.81L5.53 6.28L8 3.81L10.47 6.28L11 6.81L12.06 5.75L11.53 5.22L8.71 2.4ZM5.53 9.72L5 9.19L3.94 10.25L4.47 10.78L7.29 13.6C7.68 13.99 8.32 13.99 8.71 13.6L11.53 10.78L12.06 10.25L11 9.19L10.47 9.72L8 12.19L5.53 9.72Z"
            fill="currentColor"
          />
        </svg>
      </span>
      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
        {workspaceName}
      </span>
    </button>
  );
}
