const pending = new Map<string, string>();

export function setPendingAnchor(path: string, anchor: string): void {
  pending.set(path, anchor);
}

export function consumePendingAnchor(path: string): string | undefined {
  const anchor = pending.get(path);
  if (anchor !== undefined) pending.delete(path);
  return anchor;
}
