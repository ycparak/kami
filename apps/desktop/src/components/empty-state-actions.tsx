import { useOpenCommandPalette } from "@/hooks/use-command-palette";

export const EMPTY_STATE_ACTIONS = [
  { label: "Create new note", shortcut: "⌘N", intent: "create-file" },
  { label: "Search", shortcut: "⌘O", intent: "search" },
] as const;

export function EmptyStateActions() {
  const openCommandPalette = useOpenCommandPalette();

  return (
    <div
      className="empty-state-foreground pointer-events-auto absolute right-0 top-0 z-50 flex -translate-y-px items-center gap-4"
      style={{
        height: "calc(var(--chrome-control-height) + var(--chrome-control-padding) * 2)",
        padding: "var(--chrome-control-padding) 12px",
      }}
    >
      {EMPTY_STATE_ACTIONS.map((action) => (
        <button
          key={action.intent}
          type="button"
          onClick={() => openCommandPalette(action.intent)}
          className="empty-state-action flex items-center gap-1.5 text-[13px] transition-colors"
        >
          {action.label}
          <kbd className="empty-state-shortcut rounded-md px-1.5 py-0.5 text-[11px] tracking-[0.2em]">
            {action.shortcut}
          </kbd>
        </button>
      ))}
    </div>
  );
}
