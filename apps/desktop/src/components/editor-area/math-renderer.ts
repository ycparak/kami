import katex from "katex";

const HTML_CACHE_LIMIT = 200;
const htmlCache = new Map<string, string>();

export interface MathRenderResult {
  html: string;
  error?: undefined;
}

export interface MathRenderError {
  html?: undefined;
  error: string;
}

function cacheGet(key: string): string | undefined {
  const cached = htmlCache.get(key);
  if (cached === undefined) return undefined;
  htmlCache.delete(key);
  htmlCache.set(key, cached);
  return cached;
}

function cacheSet(key: string, value: string): void {
  if (htmlCache.has(key)) htmlCache.delete(key);
  htmlCache.set(key, value);
  while (htmlCache.size > HTML_CACHE_LIMIT) {
    const oldest = htmlCache.keys().next().value;
    if (oldest === undefined) break;
    htmlCache.delete(oldest);
  }
}

export function renderMath(
  formula: string,
  displayMode: boolean,
): MathRenderResult | MathRenderError {
  const key = (displayMode ? "D:" : "I:") + formula;
  const cached = cacheGet(key);
  if (cached !== undefined) return { html: cached };

  try {
    const html = katex.renderToString(formula, {
      displayMode,
      throwOnError: false,
      output: "html",
    });
    cacheSet(key, html);
    return { html };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}

export function clearMathCache() {
  htmlCache.clear();
}
