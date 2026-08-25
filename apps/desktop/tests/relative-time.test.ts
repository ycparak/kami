import { describe, expect, test } from "vite-plus/test";
import { formatRelativeTime } from "../src/lib/relative-time";

const NOW = 1_000_000;

describe("formatRelativeTime", () => {
  test("returns null for an unknown (zero) timestamp", () => {
    expect(formatRelativeTime(0, NOW)).toBeNull();
  });

  test("recent opens read as 'just now'", () => {
    expect(formatRelativeTime(NOW, NOW)).toBe("just now");
    expect(formatRelativeTime(NOW - 30, NOW)).toBe("just now");
  });

  test("future timestamps clamp to 'just now' rather than negative", () => {
    expect(formatRelativeTime(NOW + 500, NOW)).toBe("just now");
  });

  test("minutes, hours, days, and weeks pluralize correctly", () => {
    expect(formatRelativeTime(NOW - 60, NOW)).toBe("1 min ago");
    expect(formatRelativeTime(NOW - 2 * 60, NOW)).toBe("2 mins ago");
    expect(formatRelativeTime(NOW - 60 * 60, NOW)).toBe("1 hour ago");
    expect(formatRelativeTime(NOW - 3 * 60 * 60, NOW)).toBe("3 hours ago");
    expect(formatRelativeTime(NOW - 24 * 60 * 60, NOW)).toBe("1 day ago");
    expect(formatRelativeTime(NOW - 5 * 24 * 60 * 60, NOW)).toBe("5 days ago");
    expect(formatRelativeTime(NOW - 14 * 24 * 60 * 60, NOW)).toBe("2 weeks ago");
  });
});
