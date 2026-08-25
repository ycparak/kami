import { Menu } from "@tauri-apps/api/menu/menu";
import { PredefinedMenuItem } from "@tauri-apps/api/menu/predefinedMenuItem";
import { MenuItem } from "@tauri-apps/api/menu/menuItem";

export type BulkMenuActionId = "delete" | "copy-relative-paths" | "copy-absolute-paths";

export interface BulkContextMenuHandlers {
  onDelete: () => void;
  onCopyRelativePaths: () => void;
  onCopyAbsolutePaths: () => void;
}

export function buildBulkMenuItemsSpec(
  handlers: BulkContextMenuHandlers,
  count: number,
): Array<
  { kind: "item"; id: BulkMenuActionId; text: string; action: () => void } | { kind: "separator" }
> {
  return [
    {
      kind: "item",
      id: "copy-relative-paths",
      text: `Copy ${count} relative paths`,
      action: handlers.onCopyRelativePaths,
    },
    {
      kind: "item",
      id: "copy-absolute-paths",
      text: `Copy ${count} absolute paths`,
      action: handlers.onCopyAbsolutePaths,
    },
    { kind: "separator" },
    {
      kind: "item",
      id: "delete",
      text: `Delete ${count} items`,
      action: handlers.onDelete,
    },
  ];
}

export async function showBulkContextMenu(
  handlers: BulkContextMenuHandlers,
  count: number,
): Promise<void> {
  const spec = buildBulkMenuItemsSpec(handlers, count);

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
