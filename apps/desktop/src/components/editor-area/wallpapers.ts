const SCRIM_BOTTOM = 0.35;

const WALLPAPERS = [
  { id: "1", scrimTop: 0.65 },
  { id: "2", scrimTop: 0.5 },
  { id: "3", scrimTop: 0.4 },
  { id: "4", scrimTop: 0.6 },
  { id: "5", scrimTop: 0.4 },
  { id: "6", scrimTop: 0.5 },
  { id: "7", scrimTop: 0.2 },
  { id: "8", scrimTop: 0.5 },
  { id: "9", scrimTop: 0.5 },
] as const;

export interface Wallpaper {
  src: string;
  scrim: string;
}

// Set once at startup from `StartupState.dev_wallpaper` (see use-open-drop.ts), which is
// only ever populated in debug builds via the `--wallpaper <id>` dev launch flag.
let devWallpaperOverride: string | null = null;

export function setDevWallpaperOverride(id: string | null): void {
  devWallpaperOverride = id;
}

function toWallpaper({ id, scrimTop }: (typeof WALLPAPERS)[number]): Wallpaper {
  return {
    src: `/wallpapers/${id}.webp`,
    scrim: `linear-gradient(180deg, rgba(0,0,0,${scrimTop}), rgba(0,0,0,0), rgba(0,0,0,${SCRIM_BOTTOM}))`,
  };
}

// Stable within a local calendar day, advances at local midnight.
function localDayIndex(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

export function dailyWallpaper(date: Date = new Date()): Wallpaper {
  if (devWallpaperOverride) {
    const override = WALLPAPERS.find((w) => w.id === devWallpaperOverride);
    if (override) return toWallpaper(override);
  }
  const index = localDayIndex(date) % WALLPAPERS.length;
  return toWallpaper(WALLPAPERS[index]!);
}
