import { memo, useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "cmdk";
import type { SearchResult } from "@/types/fs";
import {
  useCloseCommandPalette,
  useCommandPaletteIntent,
  useCommandPaletteSearch,
  useIsCommandPaletteOpen,
  useOpenCommandPalette,
  useSetCommandPaletteSearch,
} from "@/hooks/use-command-palette";
import { useSidebar } from "@/hooks/use-sidebar";
import { useIsCompactFileMode, useWorkspace } from "@/hooks/use-workspace";
import {
  useActiveFilePath,
  useActiveTabId,
  useCloseActiveTab,
  useCloseTab,
  useNavigateToFile,
  useOpenFile,
  useOpenFileInNewTab,
  useOpenSettingsTab,
  useOpenTabs,
} from "@/hooks/use-tabs";
import { useTheme } from "@/hooks/use-theme";
import { useFuzzySearch } from "./use-fuzzy-search";
import { useGlobalRecentFiles } from "@/hooks/use-global-recent-files";
import { openStandaloneFile } from "@/hooks/use-open-drop";
import { settingsKind } from "@/components/editor-area/page-kinds/settings";
import { getFileName, getFileStem, getParentDir } from "@/lib/paths";
import * as tauri from "@/lib/tauri";
import type { RecentFile } from "@/lib/tauri";

function toCreatePath(root: string, rawName: string) {
  const trimmed = rawName.trim();
  const fileName = trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`;
  return `${root}/${fileName}`;
}

function matchesSearch(text: string, q: string) {
  return text.toLowerCase().includes(q.toLowerCase());
}

const HighlightedPath = memo(function HighlightedPath({
  path,
  indices,
}: {
  path: string;
  indices: number[];
}) {
  const matched = new Set(indices);
  const runs: { text: string; isMatch: boolean }[] = [];
  Array.from(path).forEach((char, i) => {
    const isMatch = matched.has(i);
    const previous = runs[runs.length - 1];
    if (previous && previous.isMatch === isMatch) previous.text += char;
    else runs.push({ text: char, isMatch });
  });
  return (
    <span>
      {runs.map((run, i) => (
        <span key={i} className={run.isMatch ? "text-link font-semibold" : undefined}>
          {run.text}
        </span>
      ))}
    </span>
  );
});

export function CommandPalette() {
  const isOpen = useIsCommandPaletteOpen();
  const close = useCloseCommandPalette();
  const openCommandPalette = useOpenCommandPalette();
  const intent = useCommandPaletteIntent();
  const search = useCommandPaletteSearch();
  const setSearch = useSetCommandPaletteSearch();
  const { toggleSidebar } = useSidebar();
  const { root, isIndexing, openWorkspace, closeWorkspace } = useWorkspace();
  const openFile = useOpenFile();
  const navigateToFile = useNavigateToFile();
  const openFileInNewTab = useOpenFileInNewTab();
  const closeActiveTab = useCloseActiveTab();
  const closeTab = useCloseTab();
  const activeTabId = useActiveTabId();
  const activeFilePath = useActiveFilePath();
  const tabs = useOpenTabs();
  const { toggleTheme } = useTheme();
  const openSettingsTab = useOpenSettingsTab();
  const isCompactFileMode = useIsCompactFileMode();

  const listRef = useRef<HTMLDivElement>(null);
  const [selectedValue, setSelectedValue] = useState("");
  const modifierPressedRef = useRef(false);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const resetKeyRef = useRef<string | null>(null);

  const isCreateIntent = intent === "create-file";
  const trimmedSearch = search.trim();
  const fileQuery = isCreateIntent ? "" : search;
  const results = useFuzzySearch(isCompactFileMode ? "" : fileQuery);
  const { files: globalRecents } = useGlobalRecentFiles(30, isOpen && isCompactFileMode);
  const createBaseDir = root ?? (activeFilePath ? getParentDir(activeFilePath) : null);
  const createPath =
    createBaseDir && trimmedSearch ? toCreatePath(createBaseDir, trimmedSearch) : null;

  function handleSelect(path: string, newTab = false) {
    if (isCompactFileMode) {
      void openStandaloneFile(path);
    } else if (newTab) {
      void openFileInNewTab(path);
    } else {
      void navigateToFile(path);
    }
    close();
  }

  function handleCreate() {
    if (!createPath) return;

    close();
    void (async () => {
      await tauri.createFile(createPath);
      if (isCompactFileMode) {
        await openStandaloneFile(createPath);
      } else {
        await openFile(createPath);
      }
    })();
  }

  async function handleOpenWorkspace() {
    const picked = await tauri.pickWorkspace();
    if (picked) {
      if (isCompactFileMode) {
        await tauri.openWorkspaceInNewWindow(picked);
      } else {
        await openWorkspace(picked);
      }
    }
    close();
  }

  type Command = { id: string; label: string; description: string; run: () => void };

  const commands: Command[] = [
    root &&
      !isCompactFileMode && {
        id: "toggle-sidebar",
        label: "Toggle Sidebar",
        description: "Command",
        run: () => {
          toggleSidebar();
          close();
        },
      },
    (root || (isCompactFileMode && activeFilePath)) && {
      id: "new-file",
      label: "Create New File",
      description: "Command",
      run: () => openCommandPalette("create-file"),
    },
    root &&
      activeFilePath && {
        id: "open-in-compact-window",
        label: "Open File in Compact Window",
        description: "Command",
        run: () => {
          void tauri.openFileInStandaloneWindow(activeFilePath);
          close();
        },
      },
    activeTabId &&
      !isCompactFileMode && {
        id: "close-tab",
        label: "Close Current Tab",
        description: "Command",
        run: () => {
          closeActiveTab();
          close();
        },
      },
    tabs.length > 0 &&
      !isCompactFileMode && {
        id: "close-all",
        label: "Close All Tabs",
        description: "Command",
        run: () => {
          for (const tab of tabs) closeTab(tab.id);
          close();
        },
      },
    {
      id: "open-workspace",
      label: "Open Workspace",
      description: "Command",
      run: () => void handleOpenWorkspace(),
    },
    root && {
      id: "close-workspace",
      label: "Close Workspace",
      description: "Command",
      run: () => {
        closeWorkspace();
        close();
      },
    },
    {
      id: "toggle-theme",
      label: "Toggle Dark Mode",
      description: "Command",
      run: () => {
        toggleTheme();
        close();
      },
    },
    !isCompactFileMode && {
      id: "open-settings",
      label: "Settings",
      description: settingsKind.description,
      run: () => {
        openSettingsTab();
        close();
      },
    },
  ].filter((c): c is Command => Boolean(c));

  const visibleFiles: SearchResult[] =
    !isCreateIntent && trimmedSearch && !isCompactFileMode ? results : [];
  const visibleRecents: RecentFile[] =
    !isCreateIntent && isCompactFileMode && trimmedSearch
      ? globalRecents.filter(
          (entry) =>
            matchesSearch(entry.title ?? "", trimmedSearch) ||
            matchesSearch(entry.name, trimmedSearch) ||
            matchesSearch(entry.path, trimmedSearch),
        )
      : [];
  const visibleCommands = isCreateIntent
    ? []
    : trimmedSearch
      ? commands.filter((c) => matchesSearch(c.label, trimmedSearch))
      : commands;
  const visibleValues = isCreateIntent
    ? createPath
      ? [createPath]
      : []
    : [
        ...visibleCommands.map((c) => c.id),
        ...visibleFiles.map((f) => f.path),
        ...visibleRecents.map((entry) => entry.path),
      ];
  const firstValue = visibleValues[0] ?? "";
  const isSelectionVisible = visibleValues.includes(selectedValue);

  const resetKey = isOpen ? `${intent}\u0000${search}` : null;

  useEffect(() => {
    if (resetKey === null) {
      resetKeyRef.current = null;
      return;
    }
    const isReset = resetKeyRef.current !== resetKey;
    resetKeyRef.current = resetKey;
    if (!isReset && isSelectionVisible) return;
    pointerRef.current = null;
    setSelectedValue(firstValue);
    listRef.current?.scrollTo({ top: 0 });
  }, [resetKey, isSelectionVisible, firstValue]);

  function handlePointerMoveCapture(event: PointerEvent<HTMLDivElement>) {
    const previous = pointerRef.current;
    pointerRef.current = { x: event.clientX, y: event.clientY };
    if (previous && (previous.x !== event.clientX || previous.y !== event.clientY)) return;
    event.stopPropagation();
  }

  const placeholder = isCreateIntent ? "Create a new note..." : "Search...";

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      label="Command Palette"
      shouldFilter={false}
      value={selectedValue}
      onValueChange={setSelectedValue}
      onKeyDown={(event) => {
        if (isCompactFileMode) return;
        if (event.key !== "Enter") return;
        if (!(event.metaKey || event.ctrlKey)) return;
        const path = visibleFiles.find((f) => f.path === selectedValue)?.path ?? null;
        if (!path) return;
        event.preventDefault();
        handleSelect(path, true);
      }}
    >
      <CommandInput placeholder={placeholder} value={search} onValueChange={setSearch} />
      <CommandList ref={listRef} onPointerMoveCapture={handlePointerMoveCapture}>
        {isCreateIntent ? (
          <>
            {!trimmedSearch && <CommandEmpty>Type a note name to create it.</CommandEmpty>}
            {createPath && (
              <CommandGroup heading="Create note">
                <CommandItem value={createPath} onSelect={handleCreate}>
                  Create: {getFileName(createPath)}
                </CommandItem>
              </CommandGroup>
            )}
          </>
        ) : (
          <>
            {visibleFiles.length === 0 &&
              visibleRecents.length === 0 &&
              visibleCommands.length === 0 && (
                <CommandEmpty>
                  {isIndexing && trimmedSearch && !isCompactFileMode
                    ? "Indexing workspace..."
                    : "No results found."}
                </CommandEmpty>
              )}

            {(visibleFiles.length > 0 ||
              visibleRecents.length > 0 ||
              visibleCommands.length > 0) && (
              <CommandGroup
                heading={
                  trimmedSearch ? (isIndexing ? "Results (indexing...)" : "Results") : "Suggested"
                }
              >
                {visibleCommands.map((c) => (
                  <CommandItem key={c.id} value={c.id} onSelect={c.run}>
                    <div className="flex flex-col">
                      <span>{c.label}</span>
                      <span className="text-[13px] text-text-muted">{c.description}</span>
                    </div>
                  </CommandItem>
                ))}

                {visibleFiles.map((r) => (
                  <CommandItem
                    key={r.path}
                    value={r.path}
                    onMouseDown={(event) => {
                      modifierPressedRef.current = event.metaKey || event.ctrlKey;
                    }}
                    onSelect={() => {
                      const newTab = modifierPressedRef.current;
                      modifierPressedRef.current = false;
                      handleSelect(r.path, newTab);
                    }}
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{getFileName(r.path)}</span>
                      <span className="truncate text-[13px] text-text-muted">
                        <HighlightedPath path={r.relative_path} indices={r.match_indices} />
                      </span>
                    </div>
                  </CommandItem>
                ))}

                {visibleRecents.map((entry) => (
                  <CommandItem
                    key={entry.path}
                    value={entry.path}
                    onSelect={() => handleSelect(entry.path)}
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{entry.title || getFileStem(entry.name)}</span>
                      <span className="truncate text-[13px] text-text-muted">
                        {getParentDir(entry.path)}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
