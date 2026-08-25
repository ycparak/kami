function stripQuotes(name: string): string {
  const match = name.match(/^(["'])(.*)\1$/);
  return match ? match[2] : name;
}

export function firstFamily(stack: string): string {
  return stripQuotes((stack.split(",")[0] ?? "").trim());
}

export function stackWithFamily(family: string, currentStack: string): string {
  const name = family.trim();
  const quoted = /^[A-Za-z][A-Za-z0-9-]*$/.test(name) ? name : `"${name.replace(/"/g, '\\"')}"`;
  const tail = currentStack
    .split(",")
    .slice(1)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && stripQuotes(part) !== name);
  return [quoted, ...tail].join(", ");
}
