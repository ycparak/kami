import { getFileStem, getParentDir, normalizePath } from "./paths";
import type { SearchResult } from "@/types/fs";

export type WikiLinkTarget = { kind: "internal"; path: string } | { kind: "unresolved" };
export interface ParsedWikiLink {
  raw: string;
  target: string;
  path: string;
  fragment: string | null;
  alias: string | null;
  displayText: string;
}

function unescapeWikiText(text: string): string {
  return text.replace(/\\\|/g, "|").trim();
}

function splitAlias(raw: string): { target: string; alias: string | null } {
  const separator = raw.indexOf("|");
  if (separator === -1) {
    return { target: raw, alias: null };
  }

  const escapedSeparator = separator > 0 && raw[separator - 1] === "\\";
  const targetEnd = escapedSeparator ? separator - 1 : separator;

  return {
    target: raw.slice(0, targetEnd),
    alias: unescapeWikiText(raw.slice(separator + 1)),
  };
}

function splitFragment(target: string): { path: string; fragment: string | null } {
  const hashIndex = target.indexOf("#");
  if (hashIndex === -1) {
    return { path: target, fragment: null };
  }

  return {
    path: target.slice(0, hashIndex),
    fragment: target.slice(hashIndex + 1),
  };
}

export function parseWikiLink(raw: string): ParsedWikiLink {
  const { target, alias } = splitAlias(raw.trim());
  const normalizedTarget = unescapeWikiText(target);
  const { path, fragment } = splitFragment(normalizedTarget);
  const normalizedPath = normalizeWikiTarget(path);
  const fallbackDisplay = normalizedPath || (fragment ? `#${fragment}` : normalizedTarget);

  return {
    raw,
    target: normalizedTarget,
    path: normalizedPath,
    fragment,
    alias: alias || null,
    displayText: alias || fallbackDisplay,
  };
}

export function normalizeWikiTarget(raw: string): string {
  let target = raw.trim().replace(/\\/g, "/");
  target = target.replace(/^\/+/, "");
  const lower = target.toLowerCase();
  if (lower.endsWith(".md")) {
    target = target.slice(0, -3);
  } else if (lower.endsWith(".markdown")) {
    target = target.slice(0, -9);
  }
  return target;
}

export async function resolveWikiLink(
  raw: string,
  workspaceRoot: string,
  fuzzySearch: (query: string, limit?: number) => Promise<SearchResult[]>,
  fileExists: (path: string) => Promise<boolean>,
  currentFilePath?: string | null,
): Promise<WikiLinkTarget> {
  const link = parseWikiLink(raw);
  const target = link.path;
  if (!target && link.fragment && currentFilePath) {
    return { kind: "internal", path: currentFilePath };
  }
  if (!target) return { kind: "unresolved" };

  if (target.includes("/")) {
    const basePath = normalizePath(`${workspaceRoot.replace(/\/$/, "")}/${target}`);
    const candidatePaths = [`${basePath}.md`, `${basePath}.markdown`];
    const existence = await Promise.all(candidatePaths.map((path) => fileExists(path)));
    const matchIndex = existence.findIndex(Boolean);
    if (matchIndex !== -1) {
      return { kind: "internal", path: candidatePaths[matchIndex] };
    }
    return { kind: "unresolved" };
  }

  const results = await fuzzySearch(target, 50);
  const targetLower = target.toLowerCase();
  const exactMatches = results.filter((r) => getFileStem(r.filename).toLowerCase() === targetLower);

  if (exactMatches.length === 1) {
    return { kind: "internal", path: exactMatches[0].path };
  }

  return { kind: "unresolved" };
}

const WIKI_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

export function parseWikiImageEmbedTarget(raw: string): string | null {
  const { target } = splitAlias(raw.trim());
  const path = unescapeWikiText(target).replace(/\\/g, "/").replace(/^\/+/, "");
  const dot = path.lastIndexOf(".");
  if (dot <= 0 || dot === path.length - 1) return null;
  const ext = path.slice(dot + 1).toLowerCase();
  return WIKI_IMAGE_EXTENSIONS.has(ext) ? path : null;
}

export async function resolveWikiImage(
  target: string,
  workspaceRoot: string | null,
  currentFilePath: string | null,
  fileExists: (path: string) => Promise<boolean>,
  findFileByName: (root: string, fileName: string) => Promise<string | null>,
): Promise<string | null> {
  const noteDir = currentFilePath ? getParentDir(currentFilePath) : null;
  const root = workspaceRoot ? workspaceRoot.replace(/\/$/, "") : null;

  const candidates: string[] = [];
  const pushCandidate = (base: string | null) => {
    if (!base) return;
    const path = normalizePath(`${base}/${target}`);
    if (!candidates.includes(path)) candidates.push(path);
  };
  if (target.includes("/")) {
    pushCandidate(root);
    pushCandidate(noteDir);
  } else {
    pushCandidate(noteDir);
    pushCandidate(root);
  }

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }

  if (root && !target.includes("/")) {
    return findFileByName(root, target);
  }
  return null;
}

export function canonicalWikiTarget(file: SearchResult, allFiles: SearchResult[]): string {
  const stem = getFileStem(file.filename);
  const stemLower = stem.toLowerCase();

  const hasDuplicate = allFiles.some(
    (f) => f.path !== file.path && getFileStem(f.filename).toLowerCase() === stemLower,
  );

  if (!hasDuplicate) return stem;

  return stripMdExtension(file.relative_path);
}

function stripMdExtension(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".md")) return path.slice(0, -3);
  if (lower.endsWith(".markdown")) return path.slice(0, -9);
  return path;
}
