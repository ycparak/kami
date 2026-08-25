const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export function formatRelativeTime(
  openedAt: number,
  nowSecs: number = Math.floor(Date.now() / 1000),
): string | null {
  if (!openedAt) return null;

  const diff = Math.max(0, nowSecs - openedAt);

  if (diff < 45) return "just now";
  if (diff < HOUR) {
    const mins = Math.round(diff / MINUTE);
    return `${mins} min${mins === 1 ? "" : "s"} ago`;
  }
  if (diff < DAY) {
    const hours = Math.round(diff / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (diff < WEEK) {
    const days = Math.round(diff / DAY);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }
  const weeks = Math.round(diff / WEEK);
  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
}
