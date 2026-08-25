const PREFIX = "startup:";
const ORIGIN = `${PREFIX}script-eval`;

const ordered: string[] = [];
const seen = new Set<string>();
let timelineLogged = false;

function isEnabled(): boolean {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") {
    return false;
  }
  return import.meta.env.DEV;
}

export function mark(name: string): void {
  if (!isEnabled()) return;
  const fullName = name.startsWith(PREFIX) ? name : `${PREFIX}${name}`;
  if (seen.has(fullName)) return;
  try {
    performance.mark(fullName);
  } catch {
    return;
  }
  seen.add(fullName);
  ordered.push(fullName);
}

export function logTimeline(): void {
  if (!isEnabled() || timelineLogged) return;
  if (!seen.has(ORIGIN)) return;
  timelineLogged = true;

  const rows: Array<{ event: string; sinceStart: string; delta: string }> = [];
  let prev: number | null = null;
  let originTime: number | null = null;

  for (const fullName of ordered) {
    const entries = performance.getEntriesByName(fullName, "mark");
    const entry = entries[entries.length - 1];
    if (!entry) continue;
    if (originTime === null) originTime = entry.startTime;
    const sinceStart = entry.startTime - (originTime ?? 0);
    const delta = prev === null ? 0 : entry.startTime - prev;
    prev = entry.startTime;
    rows.push({
      event: fullName.slice(PREFIX.length),
      sinceStart: `${sinceStart.toFixed(1)}ms`,
      delta: `+${delta.toFixed(1)}ms`,
    });
  }

  if (rows.length === 0) return;
  // eslint-disable-next-line no-console
  console.table(rows);
}
