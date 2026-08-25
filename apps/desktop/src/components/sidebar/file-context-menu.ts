import { Menu } from "@tauri-apps/api/menu/menu";
import { PredefinedMenuItem } from "@tauri-apps/api/menu/predefinedMenuItem";
import { MenuItem } from "@tauri-apps/api/menu/menuItem";
import { detectPlatform, revealLabelForPlatform, type Platform } from "./context-menu-utils";

export { detectPlatform, revealLabelForPlatform, type Platform } from "./context-menu-utils";

export type FileMenuActionId =
  | "open"
  | "open-in-new-tab"
  | "toggle-pin"
  | "duplicate"
  | "copy-relative-path"
  | "copy-absolute-path"
  | "reveal"
  | "rename"
  | "delete";

export interface FileContextMenuHandlers {
  isPinned?: boolean;
  onOpen: () => void;
  onOpenInNewTab: () => void;
  onTogglePin: () => void;
  onDuplicate: () => void;
  onCopyRelativePath: () => void;
  onCopyAbsolutePath: () => void;
  onReveal: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function buildFileMenuItemsSpec(
  handlers: FileContextMenuHandlers,
  platform: Platform = detectPlatform(),
): Array<
  { kind: "item"; id: FileMenuActionId; text: string; action: () => void } | { kind: "separator" }
> {
  return [
    { kind: "item", id: "open", text: "Open", action: handlers.onOpen },
    {
      kind: "item",
      id: "open-in-new-tab",
      text: "Open in new tab",
      action: handlers.onOpenInNewTab,
    },
    {
      kind: "item",
      id: "toggle-pin",
      text: handlers.isPinned ? "Unpin" : "Pin",
      action: handlers.onTogglePin,
    },
    { kind: "separator" },
    { kind: "item", id: "duplicate", text: "Duplicate", action: handlers.onDuplicate },
    { kind: "separator" },
    {
      kind: "item",
      id: "copy-relative-path",
      text: "Copy relative path",
      action: handlers.onCopyRelativePath,
    },
    {
      kind: "item",
      id: "copy-absolute-path",
      text: "Copy absolute path",
      action: handlers.onCopyAbsolutePath,
    },
    { kind: "separator" },
    {
      kind: "item",
      id: "reveal",
      text: revealLabelForPlatform(platform),
      action: handlers.onReveal,
    },
    { kind: "separator" },
    { kind: "item", id: "rename", text: "Rename...", action: handlers.onRename },
    { kind: "item", id: "delete", text: "Delete", action: handlers.onDelete },
  ];
}

export async function showFileContextMenu(handlers: FileContextMenuHandlers): Promise<void> {
  const spec = buildFileMenuItemsSpec(handlers);

  const items = await Promise.all(
    spec.map(async (entry) => {
      if (entry.kind === "separator") {
        return PredefinedMenuItem.new({ item: "Separator" });
      }
      return MenuItem.new({
        id: entry.id,
        text: entry.text,
        action: entry.action,
      });
    }),
  );

  const menu = await Menu.new({ items });
  await menu.popup();
}
