import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

vi.mock("@tauri-apps/api/menu/menu", () => ({ Menu: { new: vi.fn() } }));
vi.mock("@tauri-apps/api/menu/predefinedMenuItem", () => ({
  PredefinedMenuItem: { new: vi.fn() },
}));
vi.mock("@tauri-apps/api/menu/menuItem", () => ({ MenuItem: { new: vi.fn() } }));

import {
  buildFileMenuItemsSpec,
  detectPlatform,
  revealLabelForPlatform,
  type FileContextMenuHandlers,
  type Platform,
} from "../src/components/sidebar/file-context-menu";

function makeHandlers(): FileContextMenuHandlers & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    onOpen: () => calls.push("open"),
    onOpenInNewTab: () => calls.push("open-in-new-tab"),
    onTogglePin: () => calls.push("toggle-pin"),
    onDuplicate: () => calls.push("duplicate"),
    onCopyRelativePath: () => calls.push("copy-relative-path"),
    onCopyAbsolutePath: () => calls.push("copy-absolute-path"),
    onReveal: () => calls.push("reveal"),
    onRename: () => calls.push("rename"),
    onDelete: () => calls.push("delete"),
  };
}

describe("revealLabelForPlatform", () => {
  test("uses Finder on macOS", () => {
    expect(revealLabelForPlatform("macos")).toBe("Reveal in Finder");
  });

  test("uses Explorer on Windows", () => {
    expect(revealLabelForPlatform("windows")).toBe("Reveal in Explorer");
  });

  test("uses generic label on Linux", () => {
    expect(revealLabelForPlatform("linux")).toBe("Show in Folder");
  });
});

describe("detectPlatform", () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      writable: true,
      value: originalNavigator,
    });
  });

  function setUserAgent(ua: string) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      writable: true,
      value: { userAgent: ua },
    });
  }

  test("identifies macOS user agents", () => {
    setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
    );
    expect(detectPlatform()).toBe("macos");
  });

  test("identifies iOS-style user agents as macOS", () => {
    setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    expect(detectPlatform()).toBe("macos");
  });

  test("identifies Windows user agents", () => {
    setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    expect(detectPlatform()).toBe("windows");
  });

  test("falls back to Linux for everything else", () => {
    setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36");
    expect(detectPlatform()).toBe("linux");
  });

  test("returns linux when navigator is undefined", () => {
    // @ts-expect-error - intentionally remove navigator for the test
    delete globalThis.navigator;
    expect(detectPlatform()).toBe("linux");
  });
});

describe("buildFileMenuItemsSpec", () => {
  test("emits items in the spec order with separators", () => {
    const spec = buildFileMenuItemsSpec(makeHandlers(), "macos");

    const summary = spec.map((entry) =>
      entry.kind === "separator" ? "---" : `${entry.id}:${entry.text}`,
    );

    expect(summary).toEqual([
      "open:Open",
      "open-in-new-tab:Open in new tab",
      "toggle-pin:Pin",
      "---",
      "duplicate:Duplicate",
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
    const winSpec = buildFileMenuItemsSpec(makeHandlers(), "windows");
    const winReveal = winSpec.find((e) => e.kind === "item" && e.id === "reveal");
    expect(winReveal).toBeDefined();
    if (winReveal && winReveal.kind === "item") {
      expect(winReveal.text).toBe("Reveal in Explorer");
    }

    const linuxSpec = buildFileMenuItemsSpec(makeHandlers(), "linux");
    const linuxReveal = linuxSpec.find((e) => e.kind === "item" && e.id === "reveal");
    expect(linuxReveal).toBeDefined();
    if (linuxReveal && linuxReveal.kind === "item") {
      expect(linuxReveal.text).toBe("Show in Folder");
    }
  });

  test("each item invokes the matching handler", () => {
    const handlers = makeHandlers();
    const spec = buildFileMenuItemsSpec(handlers, "linux");

    for (const entry of spec) {
      if (entry.kind === "item") {
        entry.action();
      }
    }

    expect(handlers.calls).toEqual([
      "open",
      "open-in-new-tab",
      "toggle-pin",
      "duplicate",
      "copy-relative-path",
      "copy-absolute-path",
      "reveal",
      "rename",
      "delete",
    ]);
  });

  test("default platform falls through to detectPlatform", () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      writable: true,
      value: { userAgent: "Macintosh; Intel Mac OS X 10_15_7" },
    });
    const spec = buildFileMenuItemsSpec(makeHandlers());
    const reveal = spec.find(
      (e): e is Extract<typeof e, { kind: "item" }> => e.kind === "item" && e.id === "reveal",
    );
    expect(reveal?.text).toBe("Reveal in Finder");
  });

  test("uses unpin label for pinned files", () => {
    const handlers = makeHandlers();
    handlers.isPinned = true;

    const spec = buildFileMenuItemsSpec(handlers, "macos");
    const pinItem = spec.find(
      (e): e is Extract<typeof e, { kind: "item" }> => e.kind === "item" && e.id === "toggle-pin",
    );

    expect(pinItem?.text).toBe("Unpin");
  });

  test("Platform type accepts the three known platforms", () => {
    const platforms: Platform[] = ["macos", "windows", "linux"];
    expect(platforms).toHaveLength(3);
  });
});
