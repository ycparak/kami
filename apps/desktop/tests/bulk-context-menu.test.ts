import { describe, expect, test, vi } from "vite-plus/test";

vi.mock("@tauri-apps/api/menu/menu", () => ({ Menu: { new: vi.fn() } }));
vi.mock("@tauri-apps/api/menu/predefinedMenuItem", () => ({
  PredefinedMenuItem: { new: vi.fn() },
}));
vi.mock("@tauri-apps/api/menu/menuItem", () => ({ MenuItem: { new: vi.fn() } }));

import {
  buildBulkMenuItemsSpec,
  type BulkContextMenuHandlers,
} from "../src/components/sidebar/bulk-context-menu";

function makeHandlers(): BulkContextMenuHandlers & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    onDelete: () => calls.push("delete"),
    onCopyRelativePaths: () => calls.push("copy-relative-paths"),
    onCopyAbsolutePaths: () => calls.push("copy-absolute-paths"),
  };
}

describe("buildBulkMenuItemsSpec", () => {
  test("emits items with count in labels", () => {
    const spec = buildBulkMenuItemsSpec(makeHandlers(), 3);
    const summary = spec.map((e) => (e.kind === "separator" ? "---" : `${e.id}:${e.text}`));
    expect(summary).toEqual([
      "copy-relative-paths:Copy 3 relative paths",
      "copy-absolute-paths:Copy 3 absolute paths",
      "---",
      "delete:Delete 3 items",
    ]);
  });

  test("each item invokes the matching handler", () => {
    const handlers = makeHandlers();
    const spec = buildBulkMenuItemsSpec(handlers, 2);
    for (const entry of spec) {
      if (entry.kind === "item") entry.action();
    }
    expect(handlers.calls).toEqual(["copy-relative-paths", "copy-absolute-paths", "delete"]);
  });
});
