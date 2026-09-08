import { useState } from "react";
import { useOpenCommandPalette } from "@/hooks/use-command-palette";
import { useIsEmptyWorkspace } from "@/hooks/use-empty-workspace";
import { EMPTY_STATE_ACTIONS } from "@/components/empty-state-actions";
import { dailyWallpaper } from "./wallpapers";

export function NewTabPage() {
  const openCommandPalette = useOpenCommandPalette();
  const isEmptyWorkspace = useIsEmptyWorkspace();
  const [wallpaper] = useState(dailyWallpaper);

  if (!isEmptyWorkspace) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-10">
        <div className="flex flex-col items-center gap-3">
          {EMPTY_STATE_ACTIONS.map((action) => (
            <button
              key={action.intent}
              type="button"
              onClick={() => openCommandPalette(action.intent)}
              className="flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              {action.label}
              <kbd className="text-[11px] tracking-[0.2em] text-[var(--text-icon-muted)]">
                {action.shortcut}
              </kbd>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div aria-hidden="true" className="empty-state-backdrop relative h-full overflow-hidden">
      <div
        className="empty-state-image absolute"
        style={{
          backgroundImage: `url("${wallpaper.src}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="absolute inset-0" style={{ backgroundImage: wallpaper.scrim }} />
    </div>
  );
}
