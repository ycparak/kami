import { Menu } from "@tauri-apps/api/menu/menu";
import { CheckMenuItem } from "@tauri-apps/api/menu/checkMenuItem";

export type SidebarSurfaceToggleId = "toggle-search" | "toggle-recents";

export interface SidebarSurfaceMenuState {
  showSearch: boolean;
  showRecents: boolean;
  onToggleSearch: (visible: boolean) => void;
  onToggleRecents: (visible: boolean) => void;
}

export function buildSidebarSurfaceMenuItemsSpec(
  state: SidebarSurfaceMenuState,
): Array<{ id: SidebarSurfaceToggleId; text: string; checked: boolean; action: () => void }> {
  return [
    {
      id: "toggle-search",
      text: "Search",
      checked: state.showSearch,
      action: () => state.onToggleSearch(!state.showSearch),
    },
    {
      id: "toggle-recents",
      text: "Recents",
      checked: state.showRecents,
      action: () => state.onToggleRecents(!state.showRecents),
    },
  ];
}

export async function showSidebarSurfaceContextMenu(state: SidebarSurfaceMenuState): Promise<void> {
  const spec = buildSidebarSurfaceMenuItemsSpec(state);

  const items = await Promise.all(
    spec.map((entry) =>
      CheckMenuItem.new({
        id: entry.id,
        text: entry.text,
        checked: entry.checked,
        action: entry.action,
      }),
    ),
  );

  const menu = await Menu.new({ items });
  await menu.popup();
}
