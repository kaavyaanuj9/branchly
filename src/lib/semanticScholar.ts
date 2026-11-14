import type { SemanticScholarPaper } from "./types";

const S2_API_URL = "https://api.semanticscholar.org/graph/v1/paper/search";

export interface SemanticScholarSearchResult {
  total: number;
  offset: number;
  next?: number;
  data: SemanticScholarPaper[];
}

export function formatCitation(
  authors: { authorId?: string; name: string }[] | undefined,
  year?: number | null,
  venue?: string | null,
): string {
  let authorStr = "Unknown Authors";
  if (authors && authors.length > 0) {
    if (authors.length === 1) {
      authorStr = authors[0].name;
    } else if (authors.length === 2) {
      authorStr = `${authors[0].name} & ${authors[1].name}`;
    } else {
      authorStr = `${authors[0].name} et al.`;
    }
  }

  const parts = [authorStr];
  if (year) parts.push(String(year));
  if (venue && venue.trim()) parts.push(venue.trim());

  return parts.join(", ");
}

// Results are cached for 15 minutes: tree generation asks for papers on several claims at once,
// and a key allows only 1 request/second shared with everything else using it.
const searchCache = new Map<string, { papers: SemanticScholarPaper[]; total: number; at: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000;
const BACKOFF_MS = [1500, 3000, 6000];

/**
 * Searches Semantic Scholar for papers. With SEMANTIC_SCHOLAR_API_KEY it uses the relevance
 * search and falls back to the bulk search; without a key the bulk search (no key needed,
 * most-cited first) is used directly. 429s are retried with growing pauses.
 */
export async function searchSemanticScholar(
  query: string,
  limit = 8,
): Promise<{ papers: SemanticScholarPaper[]; total: number }> {
  const cleanQuery = query.trim();
  if (!cleanQuery) throw new Error("Search query cannot be empty.");

  const cacheKey = `${cleanQuery.toLowerCase()}::${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return { papers: cached.papers, total: cached.total };

  const base = ["paperId", "title", "abstract", "authors", "year", "citationCount", "url", "venue", "openAccessPdf"];
  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY?.trim();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "Branchly-Scientific-Workspace/1.0 (academic-research)",
  };
  if (apiKey) headers["x-api-key"] = apiKey;

  const q = encodeURIComponent(cleanQuery);
  const bulk = `${S2_API_URL}/bulk?query=${q}&sort=citationCount:desc&fields=${base.join(",")}`;
  const candidates = apiKey ? [`${S2_API_URL}?query=${q}&limit=${limit}&fields=${[...base, "tldr"].join(",")}`, bulk] : [bulk];

  let lastError: Error | null = null;
  for (const url of candidates) {
    let res = await fetch(url, { method: "GET", headers, cache: "no-store" }).catch((e) => {
      lastError = e instanceof Error ? e : new Error(String(e));
      return null;
    });
    for (const waitMs of BACKOFF_MS) {
      if (!res || res.status !== 429) break;
      await new Promise((r) => setTimeout(r, waitMs));
      res = await fetch(url, { method: "GET", headers, cache: "no-store" }).catch(() => null);
    }
    if (!res) continue;
    if (!res.ok) {
      let msg = `Semantic Scholar request failed (${res.status} ${res.statusText})`;
      try {
        const j = await res.json();
        msg = j.message || j.error || msg;
      } catch {
        /* not JSON */
      }
      lastError = new Error(
        res.status === 429
          ? `Semantic Scholar rate limit reached (HTTP 429). ${
              apiKey
                ? "Your API key quota may have been exceeded."
                : "Add SEMANTIC_SCHOLAR_API_KEY to .env.local for higher limits (https://www.semanticscholar.org/product/api#api-key-form)."
            }`
          : `Semantic Scholar error: ${msg}`,
      );
      continue; // try the next endpoint
    }
    const data = (await res.json()) as SemanticScholarSearchResult;
    const papers = (data.data || []).slice(0, limit);
    const result = { papers, total: data.total || papers.length };
    searchCache.set(cacheKey, { ...result, at: Date.now() });
    return result;
  }
  throw lastError || new Error("Failed to retrieve papers from Semantic Scholar.");
}
