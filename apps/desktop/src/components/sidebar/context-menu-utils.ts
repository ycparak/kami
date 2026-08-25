import { type Platform } from "@/lib/platform";

export { detectPlatform, type Platform } from "@/lib/platform";

export function revealLabelForPlatform(platform: Platform): string {
  switch (platform) {
    case "macos":
      return "Reveal in Finder";
    case "windows":
      return "Reveal in Explorer";
    case "linux":
      return "Show in Folder";
  }
}
