import { describe, expect, test, vi } from "vite-plus/test";

vi.mock("@tauri-apps/api/menu/menu", () => ({ Menu: { new: vi.fn() } }));
vi.mock("@tauri-apps/api/menu/predefinedMenuItem", () => ({
  PredefinedMenuItem: { new: vi.fn() },
}));
vi.mock("@tauri-apps/api/menu/menuItem", () => ({ MenuItem: { new: vi.fn() } }));

import {
  buildFolderMenuItemsSpec,
  type FolderContextMenuHandlers,
} from "../src/components/sidebar/folder-context-menu";

function makeHandlers(): FolderContextMenuHandlers & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    onNewFile: () => calls.push("new-file"),
    onNewFolder: () => calls.push("new-folder"),
    onCopyRelativePath: () => calls.push("copy-relative-path"),
    onCopyAbsolutePath: () => calls.push("copy-absolute-path"),
    onReveal: () => calls.push("reveal"),
    onRename: () => calls.push("rename"),
    onDelete: () => calls.push("delete"),
  };
}

describe("buildFolderMenuItemsSpec", () => {
  test("emits items in the spec order with separators", () => {
    const spec = buildFolderMenuItemsSpec(makeHandlers(), "macos");

    const summary = spec.map((entry) =>
      entry.kind === "separator" ? "---" : `${entry.id}:${entry.text}`,
    );

    expect(summary).toEqual([
      "new-file:New File",
      "new-folder:New Folder",
      "---",
      "copy-relative-path:Copy relative path",
      "copy-absolute-path:Copy absolute path",
      "---",
      "reveal:Reveal in Finder",
      "---",
      "rename:Rename...",
      "delete:Delete",
    ]);
  });

  test("uses platform-specific reveal label", () => {
    const winSpec = buildFolderMenuItemsSpec(makeHandlers(), "windows");
    const winReveal = winSpec.find((e) => e.kind === "item" && e.id === "reveal");
    expect(winReveal).toBeDefined();
    if (winReveal && winReveal.kind === "item") {
      expect(winReveal.text).toBe("Reveal in Explorer");
    }

    const linuxSpec = buildFolderMenuItemsSpec(makeHandlers(), "linux");
    const linuxReveal = linuxSpec.find((e) => e.kind === "item" && e.id === "reveal");
    expect(linuxReveal).toBeDefined();
    if (linuxReveal && linuxReveal.kind === "item") {
      expect(linuxReveal.text).toBe("Show in Folder");
    }
  });

  test("each item invokes the matching handler", () => {
    const handlers = makeHandlers();
    const spec = buildFolderMenuItemsSpec(handlers, "linux");

    for (const entry of spec) {
      if (entry.kind === "item") {
        entry.action();
      }
    }

    expect(handlers.calls).toEqual([
      "new-file",
      "new-folder",
      "copy-relative-path",
      "copy-absolute-path",
      "reveal",
      "rename",
      "delete",
    ]);
  });
});
