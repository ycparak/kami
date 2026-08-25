import type { WorkspaceChromeMode } from "@/stores/workspace-store";

export function getWorkspaceChromeMode(
  root: string | null,
  chromeMode: WorkspaceChromeMode,
): WorkspaceChromeMode {
  if (root) return "workspace";
  return chromeMode;
}
