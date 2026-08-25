import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type {
  DirEntry,
  FileContent,
  IndexStats,
  SearchResult,
  WriteResult,
  WorkspaceInfo,
} from "@/types/fs";

export function readDirectory(path: string): Promise<DirEntry[]> {
  return invoke("read_directory", { path });
}

export function readRecentFiles(limit: number, offset: number): Promise<DirEntry[]> {
  return invoke("read_recent_files", { limit, offset });
}

export function readFileEntries(paths: string[]): Promise<DirEntry[]> {
  return invoke("read_file_entries", { paths });
}

export function readFile(path: string): Promise<FileContent> {
  return invoke("read_file", { path });
}

export function writeFile(path: string, content: string): Promise<WriteResult> {
  return invoke("write_file", { path, content });
}

export function createFile(path: string): Promise<FileContent> {
  return invoke("create_file", { path });
}

export function createDirectory(path: string): Promise<DirEntry> {
  return invoke("create_directory", { path });
}

export function renameEntry(oldPath: string, newPath: string): Promise<void> {
  return invoke("rename_entry", { oldPath, newPath });
}

export function deleteEntry(path: string): Promise<void> {
  return invoke("delete_entry", { path });
}

export function fileExists(path: string): Promise<boolean> {
  return invoke("file_exists", { path });
}

export function findFileByName(root: string, fileName: string): Promise<string | null> {
  return invoke("find_file_by_name", { root, fileName });
}

export function revealInFileManager(path: string): Promise<void> {
  return invoke("reveal_in_file_manager", { path });
}

export function openWorkspace(path: string): Promise<WorkspaceInfo> {
  return invoke("open_workspace", { path });
}

export function openWorkspaceInNewWindow(path: string, file?: string | null): Promise<void> {
  return invoke("open_workspace_in_new_window", { path, file: file ?? null });
}

export interface RestoreWorkspaceResponse {
  workspace: WorkspaceInfo;
  entries: DirEntry[];
  recent_workspaces: string[];
  session: SessionData | null;
  active_file: FileContent | null;
  open_file: string | null;
}

export async function pickWorkspace(): Promise<string | null> {
  const selected = await openDialog({
    directory: true,
    multiple: false,
    title: "Open Folder",
  });
  return selected;
}

export async function pickFile(): Promise<string | null> {
  const selected = await openDialog({
    directory: false,
    multiple: false,
    title: "Open File",
    filters: [{ name: "Markdown", extensions: ["md", "mdx", "markdown", "txt"] }],
  });
  return selected;
}

export function getRecentWorkspaces(): Promise<string[]> {
  return invoke("get_recent_workspaces");
}

export function removeRecentWorkspace(path: string): Promise<void> {
  return invoke("remove_recent_workspace", { path });
}

export function openFileInStandaloneWindow(path: string): Promise<void> {
  return invoke("open_file_in_standalone_window", { path });
}

export function watchStandaloneFile(path: string): Promise<void> {
  return invoke("watch_standalone_file", { path });
}

export interface RecentFile {
  path: string;
  name: string;
  title: string | null;
  opened_at: number;
}

export function recordRecentFile(path: string): Promise<void> {
  return invoke("record_recent_file", { path });
}

export function removeRecentFile(path: string): Promise<void> {
  return invoke("remove_recent_file", { path });
}

export function getRecentFilesGlobal(limit?: number): Promise<RecentFile[]> {
  return invoke("get_recent_files_global", { limit: limit ?? null });
}

export interface SessionData {
  tabs?: SessionTabData[];
  active_index?: number | null;
}

export interface SerializedLocationData {
  kind: string;
  [key: string]: unknown;
}

export interface SessionTabData {
  location: SerializedLocationData;
  back: SerializedLocationData[];
  forward: SerializedLocationData[];
}

export function saveSession(
  workspaceRoot: string,
  tabs: SessionTabData[],
  activeIndex: number | null,
): Promise<void> {
  return invoke("save_session", { workspaceRoot, tabs, activeIndex });
}

export function loadSession(workspaceRoot: string): Promise<SessionData | null> {
  return invoke("load_session", { workspaceRoot });
}

export function indexWorkspace(): Promise<IndexStats> {
  return invoke("index_workspace");
}

export function fuzzySearch(query: string, limit?: number): Promise<SearchResult[]> {
  return invoke("fuzzy_search", { query, limit });
}

export function listSystemFonts(): Promise<string[]> {
  return invoke("list_system_fonts");
}

export function getSettings(): Promise<Record<string, unknown>> {
  return invoke("get_settings");
}

export function getSetting(key: string): Promise<unknown> {
  return invoke("get_setting", { key });
}

export function setSetting(
  key: string,
  value: unknown,
  scope: "global" | "workspace" = "global",
): Promise<void> {
  return invoke("set_setting", { key, value, scope });
}

export function resetSetting(key: string, scope: "global" | "workspace" = "global"): Promise<void> {
  return invoke("reset_setting", { key, scope });
}

export interface PendingOpenPayload {
  workspace: string | null;
  file: string | null;
}

export function takePendingOpen(): Promise<PendingOpenPayload | null> {
  return invoke("take_pending_open");
}

export interface StartupState {
  settings: Record<string, unknown>;
  recent_workspaces: string[];
  restore_bundle: RestoreWorkspaceResponse | null;
  standalone_file: FileContent | null;
}

export function getStartupState(): Promise<StartupState> {
  return invoke("get_startup_state");
}

export function showMainWindow(): Promise<void> {
  return getCurrentWindow().show();
}

export function saveClipboardImage(
  markdownFilePath: string,
  imageData: number[],
  format: string,
): Promise<{ relative_path: string; absolute_path: string }> {
  return invoke("save_clipboard_image", { markdownFilePath, imageData, format });
}
