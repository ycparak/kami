export interface DocumentStats {
  words: number;
  characters: number;
  paragraphs: number;
}

function normalizeDocumentContent(content: string) {
  return content
    .replace(/^\s{0,3}(?:#{1,6}|[-*+]|\d+[.)]|>)\s+/gm, "")
    .replace(/`+/g, "")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

export function getDocumentStats(content: string): DocumentStats {
  const normalized = normalizeDocumentContent(content);
  const words = normalized === "" ? 0 : (normalized.match(/\S+/g)?.length ?? 0);
  const characters = Array.from(normalized.replace(/\s+/g, " ")).length;
  const paragraphs =
    normalized === ""
      ? 0
      : normalized.split(/\n\s*\n/).flatMap((paragraph) => {
          const normalizedParagraph = paragraph.replace(/\s+/g, " ").trim();
          return normalizedParagraph ? [normalizedParagraph] : [];
        }).length;

  return { words, characters, paragraphs };
}
