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

function toWallpaper({ id, scrimTop }: (typeof WALLPAPERS)[number]): Wallpaper {
  return {
    src: `/wallpapers/${id}.webp`,
    scrim: `linear-gradient(180deg, rgba(0,0,0,${scrimTop}), rgba(0,0,0,0), rgba(0,0,0,${SCRIM_BOTTOM}))`,
  };
}

export function randomWallpaper(): Wallpaper {
  return toWallpaper(WALLPAPERS[Math.floor(Math.random() * WALLPAPERS.length)]!);
}
