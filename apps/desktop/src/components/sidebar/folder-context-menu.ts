import { Menu } from "@tauri-apps/api/menu/menu";
import { PredefinedMenuItem } from "@tauri-apps/api/menu/predefinedMenuItem";
import { MenuItem } from "@tauri-apps/api/menu/menuItem";
import { detectPlatform, revealLabelForPlatform, type Platform } from "./context-menu-utils";

export type FolderMenuActionId =
  | "new-file"
  | "new-folder"
  | "copy-relative-path"
  | "copy-absolute-path"
  | "reveal"
  | "rename"
  | "delete";

export interface FolderContextMenuHandlers {
  onNewFile: () => void;
  onNewFolder: () => void;
  onCopyRelativePath: () => void;
  onCopyAbsolutePath: () => void;
  onReveal: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function buildFolderMenuItemsSpec(
  handlers: FolderContextMenuHandlers,
  platform: Platform = detectPlatform(),
): Array<
  { kind: "item"; id: FolderMenuActionId; text: string; action: () => void } | { kind: "separator" }
> {
  return [
    { kind: "item", id: "new-file", text: "New File", action: handlers.onNewFile },
    { kind: "item", id: "new-folder", text: "New Folder", action: handlers.onNewFolder },
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

export async function showFolderContextMenu(handlers: FolderContextMenuHandlers): Promise<void> {
  const spec = buildFolderMenuItemsSpec(handlers);

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
