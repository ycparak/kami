import { FileBrowser } from "./file-browser";
import { WorkspaceSwitcher } from "./workspace-switcher";

export function Sidebar() {
  return (
    <div className="relative h-full overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-px bottom-px w-px bg-[var(--sidebar-divider-right)]"
      />
      <div className="flex h-full flex-col overflow-hidden">
        <div
          data-tauri-drag-region
          className="shrink-0"
          style={{
            height: "calc(var(--chrome-control-height) + var(--chrome-control-padding) * 2)",
          }}
        />
        <div className="min-h-0 flex-1 overflow-hidden">
          <FileBrowser />
        </div>
        <div className="shrink-0 px-3 py-3">
          <WorkspaceSwitcher />
        </div>
      </div>
    </div>
  );
}
