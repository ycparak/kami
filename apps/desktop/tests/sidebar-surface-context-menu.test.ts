import { describe, expect, test, vi } from "vite-plus/test";

vi.mock("@tauri-apps/api/menu/menu", () => ({ Menu: { new: vi.fn() } }));
vi.mock("@tauri-apps/api/menu/checkMenuItem", () => ({ CheckMenuItem: { new: vi.fn() } }));

import {
  buildSidebarSurfaceMenuItemsSpec,
  type SidebarSurfaceMenuState,
} from "../src/components/sidebar/sidebar-surface-context-menu";

function makeState(
  showSearch: boolean,
  showRecents: boolean,
): SidebarSurfaceMenuState & { toggles: Array<[string, boolean]> } {
  const toggles: Array<[string, boolean]> = [];
  return {
    toggles,
    showSearch,
    showRecents,
    onToggleSearch: (visible) => toggles.push(["search", visible]),
    onToggleRecents: (visible) => toggles.push(["recents", visible]),
  };
}

describe("buildSidebarSurfaceMenuItemsSpec", () => {
  test("lists both toggles with checked reflecting visibility", () => {
    const spec = buildSidebarSurfaceMenuItemsSpec(makeState(true, false));

    expect(spec.map((entry) => [entry.id, entry.text, entry.checked])).toEqual([
      ["toggle-search", "Search", true],
      ["toggle-recents", "Recents", false],
    ]);
  });

  test("toggling flips the current visibility", () => {
    const state = makeState(true, false);

    const spec = buildSidebarSurfaceMenuItemsSpec(state);
    for (const entry of spec) entry.action();

    expect(state.toggles).toEqual([
      ["search", false],
      ["recents", true],
    ]);
  });
});
